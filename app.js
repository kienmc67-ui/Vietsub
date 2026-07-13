const videoFileInput = document.createElement('input');
videoFileInput.type = 'file';
videoFileInput.accept = 'video/*';

const dropZone = document.getElementById('dropZone');
const uploadText = document.getElementById('uploadText');
const mainVideo = document.getElementById('mainVideo');
const blurLayer = document.getElementById('blurLayer');
const liveSubText = document.getElementById('liveSubText');

const sliderY = document.getElementById('sliderY');
const sliderHeight = document.getElementById('sliderHeight');
const ocrLangSelect = document.getElementById('ocrLang');
const voiceSelect = document.getElementById('voiceSelect');
const ttsRate = document.getElementById('ttsRate');
const logOcr = document.getElementById('logOcr');

const canvas = document.getElementById('captureCanvas');
const ctx = canvas.getContext('2d');

let ocrWorker = null;
let scanTimer = null;
let lastLoggedText = "";
let isProcessingFrame = false;

function syncSubtitlePosition() {
    const barBottom = blurLayer.style.bottom || window.getComputedStyle(blurLayer).bottom;
    const barHeight = parseFloat(window.getComputedStyle(blurLayer).height);
    liveSubText.style.bottom = barBottom;
    liveSubText.style.height = barHeight + 'px';
}

function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
    const viVoices = voices.filter(v => v.lang.includes('vi') || v.lang.includes('VI'));
    
    if(viVoices.length > 0) {
        viVoices.forEach(v => {
            let option = document.createElement('option');
            option.value = v.name;
            option.innerText = `Giọng Việt: ${v.name}`;
            voiceSelect.appendChild(option);
        });
    } else {
        let option = document.createElement('option');
        option.value = "";
        option.innerText = "Giọng mặc định thiết bị";
        voiceSelect.appendChild(option);
    }
}
if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}
setTimeout(loadVoices, 600);

async function startOcrCore() {
    logOcr.innerText = "🤖 Đang khởi động lõi AI ngôn ngữ...";
    try {
        ocrWorker = await Tesseract.createWorker(ocrLangSelect.value);
        logOcr.innerText = "⚡ Hệ thống OCR đã sẵn sàng! Bấm chạy video để dịch.";
    } catch(e) {
        logOcr.innerText = "❌ Lỗi tải thư viện ngôn ngữ!";
    }
}
startOcrCore();

ocrLangSelect.addEventListener('change', async () => {
    if(ocrWorker) await ocrWorker.terminate();
    startOcrCore();
});

dropZone.addEventListener('click', () => videoFileInput.click());
videoFileInput.addEventListener('change', function() {
    if(this.files.length > 0) {
        mainVideo.src = URL.createObjectURL(this.files[0]);
        uploadText.innerHTML = `Đã nhận: <span style="color:#22c55e">${this.files[0].name}</span>`;
        mainVideo.muted = true;
    }
});

mainVideo.addEventListener('loadedmetadata', syncSubtitlePosition);

// --- XỬ LÝ SỰ KIỆN KÉO THẢ (TOUCH & MOUSE) ---
let isDragging = false, isResizing = false, yStart, startBottom, startHeight;
function getClientY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

function actionStart(e, type) {
    if (type === 'resize') {
        isResizing = true;
        e.stopPropagation();
    } else {
        if (e.target.id === 'resizeHandle') return;
        isDragging = true;
    }
    yStart = getClientY(e);
    startBottom = parseInt(window.getComputedStyle(blurLayer).bottom, 10) || 0;
    startHeight = parseInt(window.getComputedStyle(blurLayer).height, 10) || 50;
    if(e.cancelable) e.preventDefault();
}

function actionMove(e) {
    if (!isDragging && !isResizing) return;
    let currentY = getClientY(e);
    let deltaY = yStart - currentY;

    if (isDragging) {
        let targetBottom = startBottom + deltaY;
        blurLayer.style.bottom = targetBottom + 'px';
        let maxH = mainVideo.offsetHeight || 1;
        sliderY.value = Math.min(90, Math.max(0, Math.round((targetBottom / maxH) * 100)));
    }
    if (isResizing) {
        let newH = startHeight + deltaY;
        if(newH > 20 && newH < 200) {
            blurLayer.style.height = newH + 'px';
            sliderHeight.value = newH;
        }
    }
    syncSubtitlePosition();
    if(e.cancelable) e.preventDefault();
}

function actionEnd() { isDragging = false; isResizing = false; syncSubtitlePosition(); }

blurLayer.addEventListener('mousedown', (e) => actionStart(e, 'drag'));
document.getElementById('resizeHandle').addEventListener('mousedown', (e) => actionStart(e, 'resize'));
document.addEventListener('mousemove', actionMove);
document.addEventListener('mouseup', actionEnd);

blurLayer.addEventListener('touchstart', (e) => actionStart(e, 'drag'), { passive: false });
document.getElementById('resizeHandle').addEventListener('touchstart', (e) => actionStart(e, 'resize'), { passive: false });
document.addEventListener('touchmove', actionMove, { passive: false });
document.addEventListener('touchend', actionEnd);

sliderY.addEventListener('input', function() { blurLayer.style.bottom = this.value + '%'; syncSubtitlePosition(); });
sliderHeight.addEventListener('input', function() { blurLayer.style.height = this.value + 'px'; syncSubtitlePosition(); });
syncSubtitlePosition();

// --- THUẬT TOÁN XỬ LÝ LỌC NHIỄU CHỮ RÁC ---
function cleanOcrText(text, currentLang) {
    if (!text) return "";
    
    // Loại bỏ ký tự đặc biệt, giữ lại chữ Unicode toàn cầu
    let clean = text.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    
    // Thuật toán triệt nhiễu Latinh khi đang đọc phụ đề Trung
    if (currentLang === 'chi_sim') {
        // Tách chuỗi thành từng từ đơn lẻ
        let words = clean.split(/\s+/);
        let filteredWords = words.filter(word => {
            // Nếu từ chứa ký tự Latinh (A-Z, a-z)
            if (/[a-zA-Z]/.test(word)) {
                // Chỉ giữ lại nếu từ đó có độ dài lớn (như tên riêng hợp lệ trên phim), loại bỏ các từ nhiễu ngắn 1-4 ký tự
                return word.length > 4;
            }
            return true; // Giữ lại toàn bộ chữ Trung Quốc
        });
        clean = filteredWords.join(' ');
    }
    
    return clean.replace(/\s+/g, ' ').trim();
}

async function executeTranslation(rawText) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(rawText)}`;
        const response = await fetch(url);
        const result = await response.json();
        return result[0].map(item => item[0]).join('');
    } catch (err) { return rawText; }
}

function playTtsVoice(translatedText) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); 

    const utterance = new SpeechSynthesisUtterance(translatedText);
    utterance.lang = 'vi-VN';
    utterance.rate = parseFloat(ttsRate.value);

    const voices = window.speechSynthesis.getVoices();
    const selectedVoiceObj = voices.find(v => v.name === voiceSelect.value);
    if(selectedVoiceObj) utterance.voice = selectedVoiceObj;

    window.speechSynthesis.speak(utterance);
}

// --- TIẾN TRÌNH QUÉT VIDEO ---
mainVideo.addEventListener('play', () => {
    mainVideo.muted = true;

    scanTimer = setInterval(async () => {
        if (mainVideo.paused || mainVideo.ended || !ocrWorker || isProcessingFrame) return;
        isProcessingFrame = true;

        canvas.width = mainVideo.videoWidth;
        canvas.height = mainVideo.videoHeight;

        const displayHeight = mainVideo.offsetHeight;
        const scaleFactor = mainVideo.videoHeight / displayHeight;

        const cropHeight = blurLayer.offsetHeight * scaleFactor;
        const cropBottom = parseFloat(window.getComputedStyle(blurLayer).bottom) * scaleFactor;
        const cropTop = mainVideo.videoHeight - cropBottom - cropHeight;

        ctx.drawImage(
            mainVideo, 
            0, cropTop, mainVideo.videoWidth, cropHeight, 
            0, 0, mainVideo.width, cropHeight
        );

        try {
            const { data: { text } } = await ocrWorker.recognize(canvas);
            
            // Thực thi bộ lọc chống dịch ngu
            let filteredText = cleanOcrText(text, ocrLangSelect.value);

            if (filteredText.length >= 1 && filteredText !== lastLoggedText) {
                lastLoggedText = filteredText;
                logOcr.innerText = `🔍 AI Đang đọc chữ: "${filteredText.substring(0, 30)}"`;

                let vietnameseResult = await executeTranslation(filteredText);
                liveSubText.innerText = vietnameseResult;
                playTtsVoice(vietnameseResult);
            }
        } catch (ocrError) {
            console.log("AI skip frame...");
        } finally {
            isProcessingFrame = false;
        }

    }, 500); 
});

mainVideo.addEventListener('pause', () => {
    clearInterval(scanTimer);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
});
          
