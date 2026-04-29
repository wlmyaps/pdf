let currentBuffer = null;
let currentSampleRate = 44100;
const recorder = new AudioRecorder();
let globalAudioCtx = null;
let sourceNode = null;
let isPlaying = false;

// UI Elements
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const playBtn = document.getElementById('playBtn');
const loadBtn = document.getElementById('loadBtn');
const loadFile = document.getElementById('loadFile');
const saveBtn = document.getElementById('saveBtn');
const waveform = document.getElementById('waveform');
const canvasCtx = waveform.getContext('2d');

// EQ Bands (20 Bands)
const frequencies = [
    31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 
    315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500
];
const eqBandsContainer = document.getElementById('eq-bands');
const bandGains = frequencies.map(() => 0);

function initUI() {
    eqBandsContainer.innerHTML = '';
    frequencies.forEach((f, i) => {
        const div = document.createElement('div');
        div.className = 'eq-band';
        div.innerHTML = `
            <input type="range" min="-12" max="12" value="0" step="1" data-index="${i}">
            <label>${f < 1000 ? f : (f/1000)+'k'}</label>
        `;
        div.querySelector('input').oninput = (e) => {
            bandGains[i] = parseFloat(e.target.value);
        };
        eqBandsContainer.appendChild(div);
    });
    updateUI();
}

function updateUI() {
    playBtn.disabled = !currentBuffer;
    saveBtn.disabled = !currentBuffer;
    playBtn.innerText = isPlaying ? 'Stop Playback' : 'Play';
    playBtn.style.background = isPlaying ? '#f44336' : '#4CAF50';
}

function getAudioCtx() {
    if (!globalAudioCtx) {
        globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return globalAudioCtx;
}

recordBtn.onclick = async () => {
    try {
        await recorder.start();
        currentSampleRate = 44100; // Recording is fixed at 44.1k in this app
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        recordBtn.innerText = 'Recording...';
        recordBtn.classList.add('active');
    } catch (err) {
        alert("Error: " + err.message);
    }
};

stopBtn.onclick = () => {
    currentBuffer = recorder.stop();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordBtn.innerText = 'Record';
    recordBtn.classList.remove('active');
    updateUI();
    drawBuffer();
};

playBtn.onclick = () => {
    if (isPlaying) stopPlayback();
    else startPlayback();
};

async function startPlayback() {
    if (!currentBuffer) return;
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const buffer = ctx.createBuffer(1, currentBuffer.length, currentSampleRate);
    buffer.copyToChannel(currentBuffer, 0);
    
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.value = parseFloat(document.getElementById('gainSlider').value);
    sourceNode.playbackRate.value = parseFloat(document.getElementById('rateSlider').value);
    
    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    sourceNode.onended = () => {
        isPlaying = false;
        updateUI();
    };

    sourceNode.start();
    isPlaying = true;
    updateUI();
}

function stopPlayback() {
    if (sourceNode) {
        try { sourceNode.stop(); } catch(e) {}
        sourceNode = null;
    }
    isPlaying = false;
    updateUI();
}

loadBtn.onclick = () => loadFile.click();
loadFile.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const arrayBuffer = await file.arrayBuffer();
    const ctx = getAudioCtx();
    
    try {
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        currentBuffer = decoded.getChannelData(0);
        currentSampleRate = decoded.sampleRate; // Store original sample rate
        updateUI();
        drawBuffer();
    } catch (err) {
        alert("Decode error: " + err.message);
    }
};

saveBtn.onclick = () => {
    if (!currentBuffer) return;
    const blob = AudioRecorder.encodeMP3(currentBuffer, currentSampleRate);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'web_audio_pro_v4.mp3';
    a.click();
};

const applyEffect = async (fn, ...args) => {
    if (!currentBuffer) return;
    const target = event.target;
    const originalText = target.innerText;
    target.innerText = 'Wait...';
    target.disabled = true;

    try {
        if (isPlaying) stopPlayback();
        // Always pass currentSampleRate to ensure pitch stability
        currentBuffer = await fn(currentBuffer, ...args);
        drawBuffer();
    } catch (err) {
        console.error(err);
        alert("Effect failed: " + err.message);
    } finally {
        target.innerText = originalText;
        target.disabled = false;
        updateUI();
    }
};

document.getElementById('fadeInBtn').onclick = () => applyEffect(AudioEffects.fadeIn, 2, currentSampleRate);
document.getElementById('fadeOutBtn').onclick = () => applyEffect(AudioEffects.fadeOut, 2, currentSampleRate);
document.getElementById('normalizeBtn').onclick = () => applyEffect(AudioEffects.normalize);
document.getElementById('reverseBtn').onclick = () => applyEffect(AudioEffects.reverse);
document.getElementById('invertBtn').onclick = () => applyEffect(AudioEffects.invert);
document.getElementById('removeSilenceBtn').onclick = () => applyEffect(AudioEffects.removeSilence, 0.01);
document.getElementById('compressorBtn').onclick = () => applyEffect(AudioEffects.applyCompressor, currentSampleRate);
document.getElementById('reverbBtn').onclick = () => applyEffect(AudioEffects.applyReverb, currentSampleRate);
document.getElementById('delayBtn').onclick = () => applyEffect(AudioEffects.applyDelay, currentSampleRate);
document.getElementById('distortionBtn').onclick = () => applyEffect(AudioEffects.applyDistortion, currentSampleRate);
document.getElementById('limiterBtn').onclick = () => applyEffect(AudioEffects.applyLimiter);
document.getElementById('noiseRedBtn').onclick = () => applyEffect(async (buf) => {
    const out = new Float32Array(buf.length);
    const threshold = 0.02;
    for(let i=0; i<buf.length; i++) {
        out[i] = Math.abs(buf[i]) < threshold ? 0 : buf[i];
    }
    return out;
});

const eqBtn = document.createElement('button');
eqBtn.innerText = 'Apply EQ';
eqBtn.className = 'btn-fx full-width';
eqBtn.style.marginTop = '10px';
eqBtn.onclick = () => {
    const bands = frequencies.map((f, i) => ({ f, g: bandGains[i] }));
    applyEffect(AudioEffects.applyEQ, currentSampleRate, bands);
};
document.querySelector('.eq-container').appendChild(eqBtn);

// Optimized Visualization with Downsampling
function drawBuffer() {
    if (!currentBuffer) {
        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, waveform.width, waveform.height);
        return;
    }
    const width = waveform.width = waveform.offsetWidth;
    const height = waveform.height = waveform.offsetHeight;
    canvasCtx.fillStyle = '#000';
    canvasCtx.fillRect(0, 0, width, height);
    canvasCtx.strokeStyle = '#4CAF50';
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    
    const step = Math.ceil(currentBuffer.length / width);
    const amp = height / 2;
    
    // Aggressive downsampling for UI smoothness
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        const start = i * step;
        const end = Math.min(start + step, currentBuffer.length);
        
        // If chunk is too large, skip samples inside the chunk for speed
        const skip = Math.max(1, Math.floor(step / 100)); 
        for (let j = start; j < end; j += skip) {
            const datum = currentBuffer[j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        canvasCtx.moveTo(i, (1 + min) * amp);
        canvasCtx.lineTo(i, (1 + max) * amp);
    }
    canvasCtx.stroke();
}

initUI();
window.onresize = drawBuffer;
drawBuffer();
