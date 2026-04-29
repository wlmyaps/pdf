let currentBuffer = null;
const recorder = new AudioRecorder();
const sampleRate = 44100;
let audioCtx = null;
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

// Clear container before populating
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

// Helper to update button states
function updateUI() {
    playBtn.disabled = !currentBuffer;
    saveBtn.disabled = !currentBuffer;
    playBtn.innerText = isPlaying ? 'Stop Playback' : 'Play';
    playBtn.style.background = isPlaying ? '#f44336' : '#4CAF50';
}

// Main Controls
recordBtn.onclick = async () => {
    try {
        await recorder.start();
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        recordBtn.innerText = 'Recording...';
        recordBtn.classList.add('active');
    } catch (err) {
        alert("Error accessing microphone: " + err);
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
    if (isPlaying) {
        stopPlayback();
        return;
    }
    startPlayback();
};

function startPlayback() {
    if (!currentBuffer) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Always resume context if suspended (browser policy)
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const buffer = audioCtx.createBuffer(1, currentBuffer.length, sampleRate);
    buffer.copyToChannel(currentBuffer, 0);
    
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = buffer;
    
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = parseFloat(document.getElementById('gainSlider').value);
    sourceNode.playbackRate.value = parseFloat(document.getElementById('rateSlider').value);
    
    sourceNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
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
        sourceNode.stop();
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
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    try {
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        // Convert to mono for this simple editor if stereo
        currentBuffer = decoded.getChannelData(0);
        updateUI();
        drawBuffer();
    } catch (err) {
        alert("Error decoding audio: " + err);
    }
};

saveBtn.onclick = () => {
    if (!currentBuffer) return;
    const blob = AudioRecorder.encodeMP3(currentBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited_audio.mp3';
    a.click();
};

// Effects Wiring
const applyEffect = async (fn, ...args) => {
    if (!currentBuffer) return;
    const originalBtnText = event.target.innerText;
    event.target.innerText = 'Processing...';
    event.target.disabled = true;

    try {
        // Stop playback before applying effects to avoid context issues
        if (isPlaying) stopPlayback();
        
        currentBuffer = await fn(currentBuffer, ...args);
        drawBuffer();
    } catch (err) {
        console.error(err);
        alert("Effect failed: " + err.message);
    } finally {
        event.target.innerText = originalBtnText;
        event.target.disabled = false;
    }
};

document.getElementById('fadeInBtn').onclick = (e) => applyEffect(AudioEffects.fadeIn, 2, sampleRate);
document.getElementById('fadeOutBtn').onclick = (e) => applyEffect(AudioEffects.fadeOut, 2, sampleRate);
document.getElementById('normalizeBtn').onclick = (e) => applyEffect(AudioEffects.normalize);
document.getElementById('reverseBtn').onclick = (e) => applyEffect(AudioEffects.reverse);
document.getElementById('invertBtn').onclick = (e) => applyEffect(AudioEffects.invert);
document.getElementById('removeSilenceBtn').onclick = (e) => applyEffect(AudioEffects.removeSilence, 0.01);
document.getElementById('compressorBtn').onclick = (e) => applyEffect(AudioEffects.applyCompressor, sampleRate);
document.getElementById('reverbBtn').onclick = (e) => applyEffect(AudioEffects.applyReverb, sampleRate);
document.getElementById('delayBtn').onclick = (e) => applyEffect(AudioEffects.applyDelay, sampleRate);
document.getElementById('distortionBtn').onclick = (e) => applyEffect(AudioEffects.applyDistortion, sampleRate);

document.getElementById('limiterBtn').onclick = (e) => applyEffect(async (buf) => {
    const out = new Float32Array(buf.length);
    for(let i=0; i<buf.length; i++) {
        out[i] = Math.max(-0.8, Math.min(0.8, buf[i]));
    }
    return out;
});

document.getElementById('noiseRedBtn').onclick = (e) => applyEffect(async (buf) => {
    const out = new Float32Array(buf.length);
    const threshold = 0.02;
    for(let i=0; i<buf.length; i++) {
        out[i] = Math.abs(buf[i]) < threshold ? 0 : buf[i];
    }
    return out;
});

// EQ Apply
const eqBtn = document.createElement('button');
eqBtn.innerText = 'Apply EQ';
eqBtn.className = 'btn-fx full-width';
eqBtn.style.marginTop = '10px';
eqBtn.onclick = (e) => {
    const bands = frequencies.map((f, i) => ({ f, g: bandGains[i] }));
    applyEffect(AudioEffects.applyEQ, sampleRate, bands);
};
document.querySelector('.eq-container').appendChild(eqBtn);

// Visualization
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
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = currentBuffer[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        canvasCtx.moveTo(i, (1 + min) * amp);
        canvasCtx.lineTo(i, (1 + max) * amp);
    }
    canvasCtx.stroke();
}

// Initial UI State
updateUI();
window.onresize = drawBuffer;
drawBuffer();
