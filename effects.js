class AudioEffects {
    static async applyGain(buffer, value) {
        const output = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            output[i] = buffer[i] * value;
        }
        return output;
    }

    static async fadeIn(buffer, durationSec, sampleRate) {
        const fadeLength = Math.floor(Math.min(buffer.length, durationSec * sampleRate));
        const output = new Float32Array(buffer);
        for (let i = 0; i < fadeLength; i++) {
            output[i] *= (i / fadeLength);
        }
        return output;
    }

    static async fadeOut(buffer, durationSec, sampleRate) {
        const fadeLength = Math.floor(Math.min(buffer.length, durationSec * sampleRate));
        const output = new Float32Array(buffer);
        const start = buffer.length - fadeLength;
        for (let i = 0; i < fadeLength; i++) {
            output[start + i] *= (1 - (i / fadeLength));
        }
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
        for (let i = 0; i < buffer.length; i++) {
            output[i] = buffer[i] * factor;
        }
        return output;
    }

    static async reverse(buffer) {
        const output = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            output[i] = buffer[buffer.length - 1 - i];
        }
        return output;
    }

    static async invert(buffer) {
        const output = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            output[i] = -buffer[i];
        }
        return output;
    }

    static async removeSilence(buffer, threshold = 0.01) {
        const result = [];
        for (let i = 0; i < buffer.length; i++) {
            if (Math.abs(buffer[i]) >= threshold) {
                result.push(buffer[i]);
            }
        }
        return new Float32Array(result);
    }

    // CRITICAL: Ensure sampleRate is consistent to prevent pitch shifts
    static async applyOfflineEffect(buffer, sampleRate, setupFn) {
        if (!buffer || buffer.length === 0) return buffer;
        
        // Use the provided sampleRate (ideally from the original buffer)
        const offlineCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
        const source = offlineCtx.createBufferSource();
        const audioBuffer = offlineCtx.createBuffer(1, buffer.length, sampleRate);
        audioBuffer.copyToChannel(buffer, 0);
        source.buffer = audioBuffer;

        setupFn(offlineCtx, source);

        source.start(0);
        const renderedBuffer = await offlineCtx.startRendering();
        return renderedBuffer.getChannelData(0);
    }

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

    static async applyReverb(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const convolver = ctx.createConvolver();
            const length = sampleRate * 2;
            const impulse = ctx.createBuffer(1, length, sampleRate);
            const data = impulse.getChannelData(0);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
            convolver.buffer = impulse;
            
            const dry = ctx.createGain();
            const wet = ctx.createGain();
            dry.gain.setValueAtTime(0.7, 0);
            wet.gain.setValueAtTime(0.3, 0);
            
            source.connect(dry);
            source.connect(wet);
            wet.connect(convolver);
            dry.connect(ctx.destination);
            convolver.connect(ctx.destination);
        });
    }

    static async applyDelay(buffer, sampleRate) {
        return AudioEffects.applyOfflineEffect(buffer, sampleRate, (ctx, source) => {
            const delay = ctx.createDelay();
            delay.delayTime.setValueAtTime(0.3, 0);
            const feedback = ctx.createGain();
            feedback.gain.setValueAtTime(0.4, 0);
            
            source.connect(ctx.destination);
            source.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            delay.connect(ctx.destination);
        });
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

    static async applyLimiter(buffer) {
        const out = new Float32Array(buffer.length);
        const limit = 0.8;
        for(let i=0; i<buffer.length; i++) {
            let x = buffer[i];
            // Soft saturation curve
            let saturated = x - (1/3) * Math.pow(x, 3);
            // Safety Hard Limit to ensure it NEVER exceeds the threshold
            out[i] = Math.min(limit, Math.max(-limit, saturated));
        }
        return out;
    }
}
