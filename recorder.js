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
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.sampleRate });
        
        // Ensure context is running
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Use ScriptProcessorNode - 4096 buffer size, 1 input channel, 1 output channel
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        
        this.audioChunks = [];
        this.processor.onaudioprocess = (e) => {
            if (!this.recording) return;
            const inputData = e.inputBuffer.getChannelData(0);
            // Copy the data so it's not overwritten
            this.audioChunks.push(new Float32Array(inputData));
        };
        
        this.recording = true;
    }

    stop() {
        this.recording = false;
        
        if (this.processor) {
            this.processor.disconnect();
            this.processor.onaudioprocess = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }

        if (this.audioChunks.length === 0) return new Float32Array(0);

        // Merge chunks into a single Float32Array
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

    static encodeMP3(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) return null;
        
        const channels = 1;
        const sampleRate = 44100;
        const kbps = 128;
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
        const mp3Data = [];

        // Convert Float32 to Int16
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
