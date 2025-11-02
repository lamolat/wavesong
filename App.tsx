import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WaveformStyle, ColorPreset } from './types';
import { PlayIcon, PauseIcon, DownloadIcon, UploadIcon, MusicIcon } from './components/icons';

const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const COLOR_PRESETS: ColorPreset[] = [
    { name: 'Synthwave', colors: ['#ec4899', '#6d28d9'] },
    { name: 'Ocean', colors: ['#38bdf8', '#34d399'] },
    { name: 'Sunset', colors: ['#f97316', '#ec4899'] },
    { name: 'Emerald', colors: ['#34d399'] },
    { name: 'Sky', colors: ['#38bdf8'] },
    { name: 'Fuchsia', colors: ['#d946ef'] },
];


const App: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [waveformStyle, setWaveformStyle] = useState<WaveformStyle>(WaveformStyle.Equalizer);
    const [colorPreset, setColorPreset] = useState<ColorPreset>(COLOR_PRESETS[0]);
    const [isTransparent, setIsTransparent] = useState<boolean>(false);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [exportProgress, setExportProgress] = useState<number>(0);
    const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameId = useRef<number>(0);
    const analyserNode = useRef<AnalyserNode | null>(null);
    const frequencyData = useRef<Uint8Array | null>(null);
    const audioSourceNode = useRef<MediaElementAudioSourceNode | null>(null);

    const drawWaveform = useCallback((
        context: CanvasRenderingContext2D,
        buffer: AudioBuffer,
        currentTime: number,
        style: WaveformStyle,
        selectedColorPreset: ColorPreset,
        isTransparentBg: boolean,
        freqData?: Uint8Array | null
    ) => {
        const data = buffer.getChannelData(0);
        const { width, height } = context.canvas;
        const sampleRate = buffer.sampleRate;
        const currentSampleIndex = Math.floor(currentTime * sampleRate);

        context.clearRect(0, 0, width, height);
        if (!isTransparentBg) {
            context.fillStyle = '#111827';
            context.fillRect(0, 0, width, height);
        }
        
        const getActiveStyle = (y1: number, y2: number) => {
             if (selectedColorPreset.colors.length > 1) {
                const gradient = context.createLinearGradient(0, y1, 0, y2);
                selectedColorPreset.colors.forEach((color, index) => {
                    gradient.addColorStop(index / (selectedColorPreset.colors.length - 1), color);
                });
                return gradient;
            }
            return selectedColorPreset.colors[0];
        }

        switch (style) {
            case WaveformStyle.Equalizer:
            case WaveformStyle.SymmetricBars:
            case WaveformStyle.BottomBars: {
                 if (!freqData) break;
                const barCount = style === WaveformStyle.Equalizer ? analyserNode.current!.frequencyBinCount / 4 : 128;
                const barGap = style === WaveformStyle.Equalizer ? 1 : 4;
                const barWidth = (width - (barCount - 1) * barGap) / barCount;
               
                for (let i = 0; i < barCount; i++) {
                    const barHeight = Math.pow(freqData[i] / 255, 2) * height;
                    const x = i * (barWidth + barGap);

                    context.fillStyle = getActiveStyle(height / 2, height);
                    
                    if (style === WaveformStyle.BottomBars) {
                        context.fillRect(x, height - barHeight, barWidth, barHeight);
                    } else { // Symmetric and Equalizer
                        context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
                    }
                }
                break;
            }
            case WaveformStyle.Pulse: {
                if (!freqData) break;
                const centerX = width / 2;
                const centerY = height / 2;

                let bassSum = 0;
                const bassFrequencies = Math.floor(freqData.length * 0.1);
                for(let i = 0; i < bassFrequencies; i++) {
                    bassSum += freqData[i];
                }
                const bassAvg = bassSum / bassFrequencies;

                const baseRadius = height * 0.1;
                const pulseRadius = baseRadius + (bassAvg / 255) * height * 0.5;

                context.fillStyle = selectedColorPreset.colors[0] + '33'; // Semi-transparent fill
                context.strokeStyle = getActiveStyle(centerY - pulseRadius, centerY + pulseRadius);
                context.lineWidth = 3;

                // Pulsing circle
                context.beginPath();
                context.arc(centerX, centerY, pulseRadius, 0, 2 * Math.PI);
                context.fill();
                context.stroke();

                 // Outer static rings for context
                context.strokeStyle = selectedColorPreset.colors[0] + '80';
                context.lineWidth = 1;
                context.beginPath();
                context.arc(centerX, centerY, height * 0.25, 0, 2 * Math.PI);
                context.stroke();
                context.beginPath();
                context.arc(centerX, centerY, height * 0.4, 0, 2 * Math.PI);
                context.stroke();
                break;
            }
            case WaveformStyle.Circle: {
                if (!freqData) break;
                const radius = height / 4;
                const numBars = 360;
                const centerX = width / 2;
                const centerY = height / 2;
                
                let strokeStyle: string | CanvasGradient;
                 if (selectedColorPreset.colors.length > 1) {
                    const gradient = context.createRadialGradient(centerX, centerY, radius, centerX, centerY, radius + height / 2);
                    selectedColorPreset.colors.forEach((color, index) => {
                        gradient.addColorStop(index / (selectedColorPreset.colors.length - 1), color);
                    });
                    strokeStyle = gradient;
                } else {
                    strokeStyle = selectedColorPreset.colors[0];
                }
                
                context.strokeStyle = strokeStyle;
                context.lineWidth = 2;

                for (let i = 0; i < numBars; i++) {
                    const dataIndex = Math.floor(i / numBars * freqData.length);
                    const amplitude = freqData[dataIndex];
                    const barHeight = Math.pow(amplitude / 255, 2) * height * 0.75;
                    const angle = (i / numBars) * 2 * Math.PI;

                    const x1 = centerX + Math.cos(angle) * radius;
                    const y1 = centerY + Math.sin(angle) * radius;
                    const x2 = centerX + Math.cos(angle) * (radius + barHeight);
                    const y2 = centerY + Math.sin(angle) * (radius + barHeight);

                    context.beginPath();
                    context.moveTo(x1, y1);
                    context.lineTo(x2, y2);
                    context.stroke();
                }
                break;
            }
            case WaveformStyle.ReflectedLine:
            case WaveformStyle.GradientLine:
            case WaveformStyle.Line: {
                let strokeStyle: string | CanvasGradient;
                if (style === WaveformStyle.Line) {
                    strokeStyle = selectedColorPreset.colors[0];
                } else {
                     if (selectedColorPreset.colors.length > 1) {
                        const gradient = context.createLinearGradient(0, 0, width, 0);
                         selectedColorPreset.colors.forEach((color, index) => {
                            gradient.addColorStop(index / (selectedColorPreset.colors.length - 1), color);
                        });
                        strokeStyle = gradient;
                    } else {
                        strokeStyle = selectedColorPreset.colors[0];
                    }
                }
                
                context.lineWidth = 2;
                context.strokeStyle = strokeStyle;
                
                const drawLine = (reflection = false) => {
                    context.beginPath();
                    const samplesToDraw = Math.floor(width);
                    const startSample = Math.max(0, currentSampleIndex - samplesToDraw / 2);
                    
                    for (let i = 0; i < samplesToDraw; i++) {
                        const sampleIndex = startSample + i;
                        const amplitude = data[sampleIndex] || 0;
                        const x = i;
                        const y = ( (reflection ? -amplitude : amplitude) * height / 4) + height / 2;
                        if (i === 0) {
                            context.moveTo(x, y);
                        } else {
                            context.lineTo(x, y);
                        }
                    }
                    context.stroke();
                }

                drawLine();
                if (style === WaveformStyle.ReflectedLine) {
                    context.globalAlpha = 0.5;
                    drawLine(true);
                    context.globalAlpha = 1.0;
                }
                break;
            }
        }
    }, []);

    const animate = useCallback(() => {
        if (!audioRef.current || !canvasRef.current || !audioBuffer) return;
        const context = canvasRef.current.getContext('2d');
        if (!context) return;
        
        if (analyserNode.current && frequencyData.current) {
            analyserNode.current.getByteFrequencyData(frequencyData.current);
        }

        drawWaveform(context, audioBuffer, audioRef.current.currentTime, waveformStyle, colorPreset, isTransparent, frequencyData.current);
        animationFrameId.current = requestAnimationFrame(animate);
    }, [audioBuffer, waveformStyle, colorPreset, drawWaveform, isTransparent]);
    
    useEffect(() => {
        if (isPlaying) {
            animationFrameId.current = requestAnimationFrame(animate);
        } else {
            if (canvasRef.current && audioBuffer && audioRef.current) {
                const context = canvasRef.current.getContext('2d');
                if (context) {
                    drawWaveform(context, audioBuffer, audioRef.current.currentTime, waveformStyle, colorPreset, isTransparent, frequencyData.current);
                }
            }
            cancelAnimationFrame(animationFrameId.current);
        }
        return () => cancelAnimationFrame(animationFrameId.current);
    }, [isPlaying, animate, audioBuffer, waveformStyle, colorPreset, drawWaveform, isTransparent]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) return;

        setIsLoading(true);
        setError('');
        setFile(selectedFile);
        setFileName(selectedFile.name);
        setAudioBuffer(null);
        setIsPlaying(false);
        setExportedVideoUrl(null);
        if (audioRef.current) audioRef.current.src = '';
        
        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            audioContext.resume();
            const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
            setAudioBuffer(decodedBuffer);
            
            if (!analyserNode.current) {
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;
                analyserNode.current = analyser;
                frequencyData.current = new Uint8Array(analyser.frequencyBinCount);
            }
            
            if (audioRef.current) {
                const url = URL.createObjectURL(selectedFile);
                audioRef.current.src = url;
                if (!audioSourceNode.current) {
                    const source = audioContext.createMediaElementSource(audioRef.current);
                    source.connect(analyserNode.current);
                    analyserNode.current.connect(audioContext.destination);
                    audioSourceNode.current = source;
                }
            }
        } catch (e) {
            setError('Failed to decode audio file. Please try a different MP3 or MP4 file.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const togglePlayPause = () => {
        if (!audioRef.current || !audioBuffer) return;
        audioContext.resume();
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleExport = async () => {
        if (!canvasRef.current || !audioBuffer) return;

        setIsExporting(true);
        setExportProgress(0);
        setExportedVideoUrl(null);

        const canvas = canvasRef.current;
        const stream = canvas.captureStream(30);
        
        const audioDestination = audioContext.createMediaStreamDestination();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        const frequencyDataForExport = new Uint8Array(analyser.frequencyBinCount);

        const bufferSource = audioContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(analyser);
        analyser.connect(audioDestination);

        const audioTrack = audioDestination.stream.getAudioTracks()[0];
        stream.addTrack(audioTrack);

        const mimeType = isTransparent ? 'video/webm; codecs=vp9,opus' : 'video/webm; codecs=vp8,opus';
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
            const url = URL.createObjectURL(blob);
            setExportedVideoUrl(url);
            setIsExporting(false);
        };

        recorder.start();
        bufferSource.start();

        const duration = audioBuffer.duration;
        
        const recordAnimation = (startTime: number) => {
            const elapsedTime = (performance.now() - startTime) / 1000;
            if (elapsedTime < duration) {
                const context = canvas.getContext('2d');
                if (context) {
                    analyser.getByteFrequencyData(frequencyDataForExport);
                    drawWaveform(context, audioBuffer, elapsedTime, waveformStyle, colorPreset, isTransparent, frequencyDataForExport);
                }
                setExportProgress((elapsedTime / duration) * 100);
                requestAnimationFrame(() => recordAnimation(startTime));
            } else {
                bufferSource.stop();
                recorder.stop();
                stream.getTracks().forEach(track => track.stop());
                setExportProgress(100);
            }
        };

        requestAnimationFrame(() => recordAnimation(performance.now()));
    };
    
    const fileExtension = isTransparent ? 'webm' : 'webm';

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
            <header className="w-full max-w-7xl text-center mb-8">
                <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Audio Waveform Video Generator</h1>
                <p className="mt-2 text-lg text-gray-400">Turn your audio into beautiful animated videos.</p>
            </header>

            <main className="w-full max-w-7xl flex flex-col lg:flex-row gap-8">
                {/* Controls Column */}
                <div className="lg:w-1/3 bg-gray-800 p-6 rounded-2xl shadow-lg flex flex-col gap-6 h-fit">
                    <div>
                        <h2 className="text-2xl font-semibold mb-3 border-b-2 border-gray-700 pb-2">1. Upload Audio</h2>
                        <label htmlFor="file-upload" className="w-full flex items-center justify-center px-4 py-6 bg-gray-700 text-gray-300 rounded-lg cursor-pointer hover:bg-gray-600 hover:text-white transition-colors">
                            <UploadIcon className="w-8 h-8 mr-3" />
                            <span className="truncate">{fileName || 'Select MP3 or MP4 file'}</span>
                        </label>
                        <input id="file-upload" type="file" accept=".mp3,.mp4,.wav,.ogg" className="hidden" onChange={handleFileChange} />
                    </div>

                    <div>
                        <h2 className="text-2xl font-semibold mb-3 border-b-2 border-gray-700 pb-2">2. Select Style</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.values(WaveformStyle).map(style => (
                                <button
                                    key={style}
                                    onClick={() => setWaveformStyle(style)}
                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${waveformStyle === style ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <h2 className="text-2xl font-semibold mb-3 border-b-2 border-gray-700 pb-2">3. Customize Color</h2>
                        <div className="grid grid-cols-3 gap-4">
                            {COLOR_PRESETS.map(preset => (
                                <div key={preset.name} className="flex flex-col items-center gap-2">
                                    <button
                                        onClick={() => setColorPreset(preset)}
                                        className={`w-full aspect-square rounded-lg transition-all duration-200 p-1 bg-gray-700 focus:outline-none ${colorPreset.name === preset.name ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-blue-500' : 'hover:ring-2 hover:ring-gray-500'}`}
                                        aria-label={preset.name}
                                    >
                                        <div 
                                            className="w-full h-full rounded-md"
                                            style={{ background: preset.colors.length > 1 ? `linear-gradient(to right, ${preset.colors.join(', ')})` : preset.colors[0] }}
                                        />
                                    </button>
                                    <span className="text-xs text-gray-400">{preset.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <h2 className="text-2xl font-semibold mb-3 border-b-2 border-gray-700 pb-2">4. Options</h2>
                        <label className="flex items-center justify-between p-3 bg-gray-700 rounded-lg cursor-pointer">
                            <span className="text-gray-300 font-medium">Transparent Background</span>
                            <div className="relative">
                                <input type="checkbox" checked={isTransparent} onChange={() => setIsTransparent(!isTransparent)} className="sr-only peer" />
                                <div className="block bg-gray-600 w-14 h-8 rounded-full peer-checked:bg-green-500 transition"></div>
                                <div className="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform peer-checked:translate-x-6"></div>
                            </div>
                        </label>
                         <p className="text-xs text-gray-500 mt-2 px-1">
                            Note: Creates a .webm video. Not all players or editors support transparency.
                        </p>
                    </div>

                </div>

                {/* Preview & Export Column */}
                <div className="lg:w-2/3 bg-gray-800 p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center">
                    <div className="w-full aspect-video bg-gray-900 rounded-lg mb-4 relative overflow-hidden">
                        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full" />
                        {!audioBuffer && !isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                                <MusicIcon className="w-24 h-24 mb-4" />
                                <p className="text-xl">Upload a file to see the preview</p>
                            </div>
                        )}
                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                                 <div className="w-16 h-16 border-4 border-t-blue-500 border-gray-600 rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                    
                    {error && <p className="text-red-400 mb-4">{error}</p>}

                    {audioBuffer && !isExporting && (
                        <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
                            <button onClick={togglePlayPause} className="w-full sm:w-auto flex-grow flex items-center justify-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors shadow-lg disabled:bg-gray-500" disabled={isLoading}>
                                {isPlaying ? <PauseIcon className="w-6 h-6 mr-2" /> : <PlayIcon className="w-6 h-6 mr-2" />}
                                <span>{isPlaying ? 'Pause' : 'Play Preview'}</span>
                            </button>
                            <button onClick={handleExport} className="w-full sm:w-auto flex-grow flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-lg disabled:bg-gray-500" disabled={isLoading}>
                                <DownloadIcon className="w-6 h-6 mr-2" />
                                <span>Create Video</span>
                            </button>
                        </div>
                    )}
                    
                    {isExporting && (
                        <div className="w-full text-center">
                            <p className="text-lg mb-2">Creating video... Please wait.</p>
                            <div className="w-full bg-gray-700 rounded-full h-4">
                                <div className="bg-blue-600 h-4 rounded-full" style={{ width: `${exportProgress}%`, transition: 'width 0.1s' }}></div>
                            </div>
                            <p className="mt-1 text-sm text-gray-400">{Math.round(exportProgress)}%</p>
                        </div>
                    )}

                    {exportedVideoUrl && (
                        <div className="w-full mt-4 text-center p-4 bg-green-900/50 border border-green-500 rounded-lg">
                             <p className="text-lg font-semibold text-green-300 mb-3">Your video is ready!</p>
                            <a 
                                href={exportedVideoUrl} 
                                download={`${fileName.split('.').slice(0, -1).join('.')}-waveform.${fileExtension}`}
                                className="inline-flex items-center justify-center px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors shadow-lg"
                            >
                                <DownloadIcon className="w-6 h-6 mr-2" />
                                <span>Download Video</span>
                            </a>
                        </div>
                    )}

                </div>
            </main>
            <audio ref={audioRef} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} className="hidden" crossOrigin="anonymous"/>
        </div>
    );
};

export default App;