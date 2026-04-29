class AudioRecorder {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.recording = false;
        this.audioChunks = [];
        this.sampleRate = 44100;
    }

    async start() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.sampleRate });
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Reduced buffer size to 2048 for lower latency while maintaining stability
            if (!this.processor) {
                this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
            }
            
            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            this.audioChunks = [];
            this.processor.onaudioprocess = (e) => {
                if (!this.recording) return;
                const inputData = e.inputBuffer.getChannelData(0);
                this.audioChunks.push(new Float32Array(inputData));
            };
            
            this.recording = true;
        } catch (err) {
            console.error("Recording start failed:", err);
            throw err;
        }
    }

    stop() {
        this.recording = false;
        if (this.processor) {
            this.processor.disconnect();
            this.processor.onaudioprocess = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioChunks.length === 0) return new Float32Array(0);

        const totalLength = this.audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of this.audioChunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        
        this.audioChunks = [];
        return result;
    }

    static encodeMP3(audioBuffer, sampleRate = 44100) {
        if (!audioBuffer || audioBuffer.length === 0) return null;
        
        const channels = 1;
        const kbps = 128;
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
        const mp3Data = [];

        const samples = new Int16Array(audioBuffer.length);
        for (let i = 0; i < audioBuffer.length; i++) {
            let s = Math.max(-1, Math.min(1, audioBuffer[i]));
            samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const sampleBlockSize = 1152;
        for (let i = 0; i < samples.length; i += sampleBlockSize) {
            const sampleChunk = samples.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }

        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) mp3Data.push(mp3buf);

        return new Blob(mp3Data, { type: 'audio/mp3' });
    }
}
