const videoInput = document.getElementById('videoUpload');
const mainVideo = document.getElementById('mainVideo');

// Bắt lỗi video trực tiếp
mainVideo.onerror = function() {
    let errorMsg = "Lỗi video: " + (mainVideo.error ? mainVideo.error.message : "Không thể load file");
    logOcr.innerText = "❌ " + errorMsg;
    console.error("Video Error Detail:", mainVideo.error);
};

videoInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Kiểm tra định dạng
    if (!file.type.startsWith('video/')) {
        logOcr.innerText = "❌ File không phải là video!";
        return;
    }

    logOcr.innerText = "🔄 Đang tải video: " + file.name;
    
    // Gỡ bỏ object cũ nếu có để tránh tràn RAM
    if (mainVideo.src) URL.revokeObjectURL(mainVideo.src);
    
    mainVideo.src = URL.createObjectURL(file);
    mainVideo.load();
    mainVideo.play().catch(e => {
        logOcr.innerText = "⚠️ Cần bấm Play thủ công!";
    });
    
    uploadText.innerHTML = `Đã chọn: <span style="color:#22c55e">${file.name}</span>`;
});
