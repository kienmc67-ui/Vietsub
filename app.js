const videoFileInput = document.createElement('input');
videoFileInput.type = 'file';
videoFileInput.accept = 'video/*';

const mainVideo = document.getElementById('mainVideo');
const blurLayer = document.getElementById('blurLayer');
const liveSubText = document.getElementById('liveSubText');
const logOcr = document.getElementById('logOcr');
const canvas = document.getElementById('captureCanvas');
const ctx = canvas.getContext('2d');

let ocrWorker = null;
let scanTimer = null;
let isProcessing = false;

// Khởi tạo AI - THÊM LOG ĐỂ BIẾT NÓ ĐANG TẢI GÌ
async function initOCR() {
    logOcr.innerText = "⏳ Đang tải dữ liệu AI (10-15s)... vui lòng chờ!";
    ocrWorker = await Tesseract.createWorker(document.getElementById('ocrLang').value);
    logOcr.innerText = "✅ AI SẴN SÀNG! BẤM PLAY VIDEO ĐỂ DỊCH!";
}
initOCR();

// BẮT SỰ KIỆN VIDEO CHẠY
mainVideo.addEventListener('play', () => {
    logOcr.innerText = "🚀 ĐANG QUÉT CHỮ...";
    
    // Quét mỗi 800ms để không làm treo máy
    scanTimer = setInterval(async () => {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            // Lấy tọa độ thanh che
            const rect = blurLayer.getBoundingClientRect();
            const videoRect = mainVideo.getBoundingClientRect();
            
            // Tính toán tỷ lệ cắt
            const scaleX = mainVideo.videoWidth / videoRect.width;
            const scaleY = mainVideo.videoHeight / videoRect.height;
            
            canvas.width = rect.width * scaleX;
            canvas.height = rect.height * scaleY;
            
            ctx.drawImage(
                mainVideo,
                (rect.left - videoRect.left) * scaleX,
                (rect.top - videoRect.top) * scaleY,
                rect.width * scaleX,
                rect.height * scaleY,
                0, 0, canvas.width, canvas.height
            );
            
            const { data: { text } } = await ocrWorker.recognize(canvas);
            const cleanText = text.replace(/[\W_]+/g, " ").trim();
            
            if (cleanText.length > 1) {
                logOcr.innerText = "🔍 Đọc được: " + cleanText.substring(0, 15);
                translateAndDisplay(cleanText);
            }
        } catch (e) {
            console.error(e);
        } finally {
            isProcessing = false;
        }
    }, 800);
});

// Dừng quét khi Pause
mainVideo.addEventListener('pause', () => {
    clearInterval(scanTimer);
    logOcr.innerText = "⏸️ ĐÃ DỪNG - BẤM PLAY ĐỂ TIẾP TỤC";
});

// HÀM DỊCH
async function translateAndDisplay(text) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = data[0][0][0];
    
    liveSubText.innerText = translated;
    
    // Đọc giọng
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(translated);
    msg.lang = 'vi-VN';
    window.speechSynthesis.speak(msg);
}
