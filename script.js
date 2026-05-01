// Password Protection (SHA-256)
const PASSWORD_HASH = '904a181ff00a1323a28d23fdb7a6b3bf9d42b87a08e3c8710dc85915634239e1';

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

document.getElementById('login-btn').onclick = async () => {
    const input = document.getElementById('app-password').value;
    const hashed = await sha256(input);
    if (hashed === PASSWORD_HASH) {
        document.getElementById('password-overlay').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        initUI();
    } else {
        document.getElementById('password-error').style.display = 'block';
    }
};

// Global Audio State
let currentBuffer = null;
let currentSampleRate = 44100;
let currentObjectURL = null;
const recorder = new AudioRecorder();
let globalAudioCtx = null;
let sourceNode = null;
let isPlaying = false;
let isProcessing = false;

// UI Elements
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const playBtn = document.getElementById('playBtn');
const loadBtn = document.getElementById('loadBtn');
const loadFile = document.getElementById('loadFile');
const saveBtn = document.getElementById('saveBtn');
const waveform = document.getElementById('waveform');
const canvasCtx = waveform.getContext('2d');

const frequencies = [31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500];
const eqBandsContainer = document.getElementById('eq-bands');
const bandGains = frequencies.map(() => 0);

function initUI() {
    if (eqBandsContainer) {
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
    }
    updateUI();
    drawBuffer();
}

function updateUI() {
    playBtn.disabled = !currentBuffer || isProcessing;
    saveBtn.disabled = !currentBuffer || isProcessing;
    playBtn.innerText = isPlaying ? 'Stop Playback' : 'Play';
    playBtn.style.background = isPlaying ? '#f44336' : '#03dac6';
}

function getAudioCtx() {
    if (!globalAudioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        globalAudioCtx = new AudioCtx();
    }
    return globalAudioCtx;
}

function cleanUpObjectURL() {
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }
}

function setNewBuffer(buffer) {
    currentBuffer = buffer;
    drawBuffer();
    updateUI();
}

// Event Handlers
recordBtn.onclick = async () => {
    try {
        await recorder.start();
        currentSampleRate = recorder.sampleRate;
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        recordBtn.innerText = 'Recording...';
    } catch (err) { alert(err); }
};

stopBtn.onclick = () => {
    setNewBuffer(recorder.stop());
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordBtn.innerText = 'Record';
};

loadBtn.onclick = () => loadFile.click();
loadFile.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const arrayBuffer = await file.arrayBuffer();
    const ctx = getAudioCtx();
    try {
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        currentSampleRate = decoded.sampleRate;
        if (decoded.numberOfChannels > 1) {
            const l = decoded.getChannelData(0);
            const r = decoded.getChannelData(1);
            const mono = new Float32Array(l.length);
            for(let i=0; i<l.length; i++) mono[i] = (l[i] + r[i]) / 2;
            setNewBuffer(mono);
        } else {
            setNewBuffer(decoded.getChannelData(0));
        }
    } catch (err) { alert(err); }
};

playBtn.onclick = () => {
    if (isPlaying) { stopPlayback(); return; }
    startPlayback();
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
    sourceNode.onended = () => { isPlaying = false; updateUI(); };
    sourceNode.start();
    isPlaying = true;
    updateUI();
}

function stopPlayback() {
    if (sourceNode) { try { sourceNode.stop(); } catch(e) {} sourceNode = null; }
    isPlaying = false;
    updateUI();
}

saveBtn.onclick = () => {
    if (!currentBuffer) return;
    cleanUpObjectURL();
    const blob = AudioRecorder.encodeMP3(currentBuffer, currentSampleRate);
    currentObjectURL = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = currentObjectURL;
    a.download = 'studio_master_v6.4.mp3';
    a.click();
};

// Fixed Effect Wrapper (Passing event explicitly)
const applyEffect = async (e, fn, ...args) => {
    if (!currentBuffer) return;
    isProcessing = true;
    updateUI();
    const target = e.target;
    const originalText = target.innerText;
    target.innerText = '...';
    try {
        if (isPlaying) stopPlayback();
        const result = await fn(currentBuffer, currentSampleRate, ...args);
        setNewBuffer(result);
    } catch (err) { console.error(err); alert("Effect failed: " + err.message); }
    target.innerText = originalText;
    isProcessing = false;
    updateUI();
};

// Bind Buttons with Explicit Event
document.getElementById('magicMasterBtn').onclick = async () => {
    if (!currentBuffer) return;
    isProcessing = true; updateUI();
    try {
        if (isPlaying) stopPlayback();
        let b = currentBuffer;
        let sr = currentSampleRate;
        b = await AudioEffects.normalize(b);
        b = await AudioEffects.applyDeEsser(b, sr);
        b = await AudioEffects.applyCompressor(b, sr);
        b = await AudioEffects.applyExciter(b, sr);
        b = await AudioEffects.applyLimiter(b);
        setNewBuffer(b);
        alert("Studio Master Applied!");
    } catch (err) { alert(err); }
    isProcessing = false; updateUI();
};

document.getElementById('applyEqBtn').onclick = (e) => {
    const bands = frequencies.map((f, i) => ({ f, g: bandGains[i] }));
    applyEffect(e, AudioEffects.applyEQ, bands);
};

document.getElementById('exciterBtn').onclick = (e) => applyEffect(e, AudioEffects.applyExciter);
document.getElementById('deesserBtn').onclick = (e) => applyEffect(e, AudioEffects.applyDeEsser);
document.getElementById('stereoBtn').onclick = async () => {
    if (!currentBuffer) return;
    isProcessing = true; updateUI();
    try {
        const channels = await AudioEffects.applyStereoWidener(currentBuffer, currentSampleRate);
        cleanUpObjectURL();
        const blob = AudioRecorder.encodeStereoMP3(channels[0], channels[1], currentSampleRate);
        currentObjectURL = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = currentObjectURL;
        a.download = 'studio_stereo_v6.4.mp3';
        a.click();
        alert("Stereo Widened & Downloaded!");
    } catch (err) { alert(err); }
    isProcessing = false; updateUI();
};

document.getElementById('compressorBtn').onclick = (e) => applyEffect(e, AudioEffects.applyCompressor);
document.getElementById('reverbBtn').onclick = (e) => applyEffect(e, AudioEffects.applyReverb);
document.getElementById('delayBtn').onclick = (e) => applyEffect(e, AudioEffects.applyDelay);
document.getElementById('limiterBtn').onclick = (e) => applyEffect(e, AudioEffects.applyLimiter);
document.getElementById('normalizeBtn').onclick = (e) => applyEffect(e, AudioEffects.normalize);
document.getElementById('noiseRedBtn').onclick = (e) => applyEffect(e, AudioEffects.applyNoiseGate);
document.getElementById('distortionBtn').onclick = (e) => applyEffect(e, AudioEffects.applyDistortion);
document.getElementById('fadeInBtn').onclick = (e) => applyEffect(e, AudioEffects.fadeIn, 2);
document.getElementById('fadeOutBtn').onclick = (e) => applyEffect(e, AudioEffects.fadeOut, 2);
document.getElementById('reverseBtn').onclick = (e) => applyEffect(e, AudioEffects.reverse);
document.getElementById('invertBtn').onclick = (e) => applyEffect(e, AudioEffects.invert);
document.getElementById('removeSilenceBtn').onclick = (e) => applyEffect(e, AudioEffects.removeSilence, 0.005);

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
    canvasCtx.strokeStyle = '#03dac6';
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    const step = Math.ceil(currentBuffer.length / width);
    const amp = height / 2;
    for (let i = 0; i < width; i++) {
        let min = 1.0, max = -1.0;
        const start = i * step;
        const end = Math.min(start + step, currentBuffer.length);
        const skip = Math.max(1, Math.floor(step / 100));
        for (let j = start; j < end; j += skip) {
            const d = currentBuffer[j];
            if (d < min) min = d; if (d > max) max = d;
        }
        canvasCtx.moveTo(i, (1 + min) * amp);
        canvasCtx.lineTo(i, (1 + max) * amp);
    }
    canvasCtx.stroke();
}

window.onresize = drawBuffer;
drawBuffer();
