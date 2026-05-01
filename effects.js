class AudioEffects {
    // Universal Offline Context Wrapper with iOS/Safari Support
    static async applyOfflineEffect(buffer, sampleRate, setupFn, extraSec = 0, outChannels = 1) {
        if (!buffer || buffer.length === 0) return buffer;
        const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const extraSamples = Math.floor(extraSec * sampleRate);
        const totalLength = buffer.length + extraSamples;
        const offlineCtx = new OfflineCtx(outChannels, totalLength, sampleRate);
        const source = offlineCtx.createBufferSource();
        const audioBuffer = offlineCtx.createBuffer(1, buffer.length, sampleRate);
        audioBuffer.copyToChannel(buffer, 0);
        source.buffer = audioBuffer;
        setupFn(offlineCtx, source);
        source.start(0);
        const renderedBuffer = await offlineCtx.startRendering();
        return outChannels === 1 ? renderedBuffer.getChannelData(0) : [renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)];
    }

    // --- RMS-BASED SILENCE REMOVAL (FIXED LOGIC) ---
    static async removeSilence(buffer, sampleRate, threshold = 0.005) {
        const blockSize = Math.floor(sampleRate * 0.02); // 20ms blocks
        const result = [];
        for (let i = 0; i < buffer.length; i += blockSize) {
            let sum = 0;
            const end = Math.min(i + blockSize, buffer.length);
            for (let j = i; j < end; j++) sum += buffer[j] * buffer[j];
            const rms = Math.sqrt(sum / (end - i));
            if (rms >= threshold) {
                for (let j = i; j < end; j++) result.push(buffer[j]);
            }
        }
        return new Float32Array(result);
    }

    // --- SMOOTH NOISE GATE (FIXED LOGIC) ---
    static async applyNoiseGate(buffer, sampleRate, threshold = 0.01) {
        const blockSize = Math.floor(sampleRate * 0.01); // 10ms for smoothing
        const output = new Float32Array(buffer.length);
        let currentGain = 1.0;
        const attack = 0.1; // Smooth transition
        const release = 0.05;

        for (let i = 0; i < buffer.length; i += blockSize) {
            let sum = 0;
            const end = Math.min(i + blockSize, buffer.length);
            for (let j = i; j < end; j++) sum += buffer[j] * buffer[j];
            const rms = Math.sqrt(sum / (end - i));
            const targetGain = rms < threshold ? 0 : 1;
            
            for (let j = i; j < end; j++) {
                // Simple linear interpolation for gain to avoid crackle
                currentGain += (targetGain - currentGain) * (targetGain > currentGain ? attack : release);
                output[j] = buffer[j] * currentGain;
            }
        }
        return output;
    }

    // --- BASIC UTILITIES ---
    static async fadeIn(buffer, sampleRate, durationSec = 2) {
        const fadeLength = Math.floor(Math.min(buffer.length, durationSec * sampleRate));
        const output = new Float32Array(buffer);
        for (let i = 0; i < fadeLength; i++) output[i] *= (i / fadeLength);
        return output;
    }

    static async fadeOut(buffer, sampleRate, durationSec = 2) {
        const fadeLength = Math.floor(Math.min(buffer.length, durationSec * sampleRate));
        const output = new Float32Array(buffer);
        const start = buffer.length - fadeLength;
        for (let i = 0; i < fadeLength; i++) output[start + i] *= (1 - (i / fadeLength));
        return output;
    }

    static async normalize(buffer) {
        let max = 0;
        for (let i = 0; i < buffer.length; i++) {
            const abs = Math.abs(buffer[i]);
            if (abs > max) max = abs;
        }
        if (max === 0) return buffer;
        const factor = 0.95 / max;
        const output = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) output[i] = buffer[i] * factor;
        return output;
    }

    static async reverse(buffer) {
        const output = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) output[i] = buffer[buffer.length - 1 - i];
        return output;
    }

    static async invert(buffer) {
        const output = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) output[i] = -buffer[i];
        return output;
    }

    // --- STUDIO EFFECTS ---
    static async applyCompressor(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-24, 0);
            compressor.knee.setValueAtTime(30, 0);
            compressor.ratio.setValueAtTime(12, 0);
            compressor.attack.setValueAtTime(0.003, 0);
            compressor.release.setValueAtTime(0.25, 0);
            source.connect(compressor);
            compressor.connect(ctx.destination);
        });
    }

    static async applyEQ(buffer, sampleRate, bands) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            let lastNode = source;
            bands.forEach(band => {
                const filter = ctx.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.setValueAtTime(band.f, 0);
                filter.Q.setValueAtTime(1, 0);
                filter.gain.setValueAtTime(band.g, 0);
                lastNode.connect(filter);
                lastNode = filter;
            });
            lastNode.connect(ctx.destination);
        });
    }

    static async applyReverb(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const convolver = ctx.createConvolver();
            const length = sampleRate * 1.5;
            const impulse = ctx.createBuffer(1, length, sampleRate);
            const data = impulse.getChannelData(0);
            for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            convolver.buffer = impulse;
            const dry = ctx.createGain();
            const wet = ctx.createGain();
            dry.gain.setValueAtTime(0.8, 0);
            wet.gain.setValueAtTime(0.2, 0);
            source.connect(dry);
            source.connect(wet);
            wet.connect(convolver);
            dry.connect(ctx.destination);
            convolver.connect(ctx.destination);
        }, 2.5);
    }

    static async applyDelay(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const delay = ctx.createDelay();
            delay.delayTime.setValueAtTime(0.3, 0);
            const feedback = ctx.createGain();
            feedback.gain.setValueAtTime(0.35, 0);
            source.connect(ctx.destination);
            source.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            delay.connect(ctx.destination);
        }, 3.0);
    }

    static async applyDistortion(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const waveshaper = ctx.createWaveShaper();
            const n = 44100;
            const curve = new Float32Array(n);
            const deg = 400;
            for (let i = 0; i < n; i++) {
                const x = (i * 2) / n - 1;
                curve[i] = ((3 + deg) * x * 20 * (Math.PI / 180)) / (Math.PI + deg * Math.abs(x));
            }
            waveshaper.curve = curve;
            source.connect(waveshaper);
            waveshaper.connect(ctx.destination);
        });
    }

    static async applyExciter(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const highPass = ctx.createBiquadFilter();
            highPass.type = 'highpass';
            highPass.frequency.setValueAtTime(3000, 0);
            const distortion = ctx.createWaveShaper();
            const n = 44100;
            const curve = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const x = (i * 2) / n - 1;
                curve[i] = (Math.PI + 100) * x / (Math.PI + 100 * Math.abs(x));
            }
            distortion.curve = curve;
            const exciterGain = ctx.createGain();
            exciterGain.gain.setValueAtTime(0.15, 0);
            source.connect(ctx.destination);
            source.connect(highPass);
            highPass.connect(distortion);
            distortion.connect(exciterGain);
            exciterGain.connect(ctx.destination);
        });
    }

    static async applyDeEsser(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-20, 0);
            compressor.knee.setValueAtTime(10, 0);
            compressor.ratio.setValueAtTime(10, 0);
            compressor.attack.setValueAtTime(0.001, 0);
            compressor.release.setValueAtTime(0.05, 0);
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(6500, 0);
            filter.Q.setValueAtTime(1.5, 0);
            source.connect(compressor);
            source.connect(filter);
            filter.connect(compressor.threshold);
            compressor.connect(ctx.destination);
        });
    }

    static async applyStereoWidener(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const left = ctx.createGain();
            const right = ctx.createGain();
            const delay = ctx.createDelay();
            delay.delayTime.setValueAtTime(0.015, 0);
            source.connect(left);
            source.connect(delay);
            delay.connect(right);
            const merger = ctx.createChannelMerger(2);
            left.connect(merger, 0, 0);
            right.connect(merger, 0, 1);
            merger.connect(ctx.destination);
        }, 0, 2);
    }

    static async applyLimiter(buffer) {
        const out = new Float32Array(buffer.length);
        const limit = 0.85;
        for(let i=0; i<buffer.length; i++) {
            let x = buffer[i];
            let saturated = x - (1/3) * Math.pow(x, 3);
            out[i] = Math.max(-limit, Math.min(limit, saturated));
        }
        return out;
    }
}
