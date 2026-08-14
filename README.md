# CN VietDub V3 — One Click

## Mục tiêu
Upload video -> Transcribe tiếng Trung -> dịch Việt -> TTS theo từng đoạn -> burn Vietsub -> mix voice-over -> MP4.

V3 hỗ trợ:
- One-click pipeline
- SRT/VTT import để dùng không cần transcription API
- Editor timestamp + Trung + Việt
- TTS từng segment
- Burn subtitle bằng FFmpeg
- Mix voice-over với audio gốc
- Progress polling
- Dọn job tạm

## Cài
Python 3.11+
FFmpeg phải có trong PATH.

pip install -r requirements.txt
copy .env.example .env
python app.py

## API adapters
TRANSCRIBE_URL nhận POST JSON:
{"video_path":"absolute/path/to/video"}
và trả:
{"segments":[{"start":0.0,"end":2.2,"text":"你好"}]}

TRANSLATE_URL:
{"text":"你好","source":"zh","target":"vi"}
trả {"text":"Xin chào"}

TTS_URL:
{"text":"Xin chào","voice":"vi-VN-HoaiMyNeural"}
trả audio bytes hoặc {"audio_base64":"..."}

Có thể thay adapter trong services.py để dùng Whisper, OpenAI-compatible, local model, Edge TTS hoặc provider khác.
