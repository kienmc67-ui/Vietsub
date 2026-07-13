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

// ĐỒNG BỘ VỊ TRÍ CHUẨN: Tính toán dựa trên chiều cao thực tế của khung hiển thị video
function syncSubtitlePosition() {
    const videoHeight = mainVideo.offsetHeight || 300; 
    const percentY = parseFloat(sliderY.value);
    const barHeight = parseFloat(sliderHeight.value);

    // Tính toán lại vị trí từ đáy lên chính xác theo tỷ lệ màn hình điện thoại
    const bottomPx = (percentY / 100) * videoHeight;
    
    blurLayer.style.bottom = bottomPx + 'px';
    blurLayer.style.height = barHeight + 'px';
    
    liveSubText.style.bottom = bottomPx + 'px';
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
        // Đợi video tải xong rồi đồng bộ vị trí ngay
        setTimeout(syncSubtitlePosition, 500);
    }
});

mainVideo.addEventListener('loadedmetadata', syncSubtitlePosition);
window.addEventListener('resize', syncSubtitlePosition);

// --- XỬ LÝ KÉO TAY TRÊN MOBILE CHUẨN XÁC ---
let isDragging = false, isResizing = false, yStart, startPercentY, startHeight;
function getClientY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

function actionStart(e, type) {
    const videoHeight = mainVideo.offsetHeight || 1;
    yStart = getClientY(e);
    startPercentY = parseFloat(sliderY.value);
    startHeight = parseFloat(sliderHeight.value);

    if (type === 'resize') {
        isResizing = true;
        e.stopPropagation();
    } else {
        if (e.target.id === 'resizeHandle') return;
        isDragging = true;
    }
    if(e.cancelable) e.preventDefault();
}

function actionMove(e) {
    if (!isDragging && !isResizing) return;
    const videoHeight = mainVideo.offsetHeight || 1;
    let currentY = getClientY(e);
    let deltaY = yStart - currentY; // Vuốt lên là dương, vuốt xuống là âm

    if (isDragging) {
        // Đổi deltaPx sang tỷ lệ % của khung video
        let deltaPercent = (deltaY / videoHeight) * 100;
        let targetPercent = startPercentY + deltaPercent;
        sliderY.value = Math.min(90, Math.max(0, Math.round(targetPercent)));
    }
    if (isResizing) {
        let newH = startHeight + deltaY;
        if(newH > 25 && newH < 150) {
            sliderHeight.value = Math.round(newH);
        }
    }
    syncSubtitlePosition();
    if(e.cancelable) e.preventDefault();
}

function actionEnd() { isDragging = false; isResizing = false; }

blurLayer.addEventListener('mousedown', (e) => actionStart(e, 'drag'));
document.getElementById('resizeHandle').addEventListener('mousedown', (e) => actionStart(e, 'resize'));
document.addEventListener('mousemove', actionMove);
document.addEventListener('mouseup', actionEnd);

blurLayer.addEventListener('touchstart', (e) => actionStart(e, 'drag'), { passive: false });
document.getElementById('resizeHandle').addEventListener('touchstart', (e) => actionStart(e, 'resize'), { passive: false });
document.addEventListener('touchmove', actionMove, { passive: false });
document.addEventListener('touchend', actionEnd);

// Lắng nghe thanh trượt thay đổi
sliderY.addEventListener('input', syncSubtitlePosition);
sliderHeight.addEventListener('input', syncSubtitlePosition);

// Khởi tạo vị trí ban đầu
setTimeout(syncSubtitlePosition, 500);

// --- THUẬT TOÁN XỬ LÝ LỌC NHIỄU CHỮ RÁC ---
function cleanOcrText(text, currentLang) {
    if (!text) return "";
    let clean = text.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    if (currentLang === 'chi_sim') {
        let words = clean.split(/\s+/);
        let filteredWords = words.filter(word => {
            if (/[a-zA-Z]/.test(word)) {
                return word.length > 4;
            }
            return true;
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

// --- TIẾN TRÌNH QUÉT VIDEO SỬA ĐỔI TỶ LỆ CẮP ẢNH CHUẨN XÁC ---
mainVideo.addEventListener('play', () => {
    mainVideo.muted = true;

    scanTimer = setInterval(async () => {
        if (mainVideo.paused || mainVideo.ended || !ocrWorker || isProcessingFrame) return;
        isProcessingFrame = true;

        canvas.width = mainVideo.videoWidth;
        canvas.height = mainVideo.videoHeight;

        const displayHeight = mainVideo.offsetHeight || 1;
        // Tính tỷ lệ scale giữa độ phân giải gốc của video và độ phân giải hiển thị trên màn hình điện thoại
        const scaleFactor = mainVideo.videoHeight / displayHeight;

        const cropHeight = parseFloat(blurLayer.style.height) * scaleFactor;
        const cropBottom = parseFloat(blurLayer.style.bottom) * scaleFactor;
        const cropTop = mainVideo.videoHeight - cropBottom - cropHeight;

        ctx.drawImage(
            mainVideo, 
            0, cropTop, mainVideo.videoWidth, cropHeight, 
            0, 0, mainVideo.width, cropHeight
        );

        try {
            const { data: { text } } = await ocrWorker.recognize(canvas);
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
