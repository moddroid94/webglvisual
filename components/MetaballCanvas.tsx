import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { vertexShaderSource, fragmentShaderSource } from '../gl/shaders';

export interface MetaballCanvasHandles {
  initAudio: () => Promise<boolean>;
}

const MetaballCanvas: React.ForwardRefRenderFunction<MetaballCanvasHandles, {}> = (props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationFrameIdRef = useRef<number>(0);
  const uniformsRef = useRef<{
    time: WebGLUniformLocation | null;
    resolution: WebGLUniformLocation | null;
    mouse: WebGLUniformLocation | null;
    displacement_mix: WebGLUniformLocation | null;
    audio: WebGLUniformLocation | null;
  }>({ time: null, resolution: null, mouse: null, displacement_mix: null, audio: null });
  
  const mousePosRef = useRef<{x: number, y: number}>({ x: window.innerWidth / 2, y: window.innerHeight / 2});
  const isMouseDownRef = useRef<boolean>(false);
  const displacementMixRef = useRef<number>(0.0);
  const lastTimeRef = useRef<number>(0);

  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array | null>(null);
  const audioLevelsRef = useRef<{ bass: number; mid: number; high: number }>({ bass: 0, mid: 0, high: 0 });

  useImperativeHandle(ref, () => ({
    initAudio: async (): Promise<boolean> => {
      if (audioContextRef.current) return true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const context = new AudioContext();
        audioContextRef.current = context;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;
        audioDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        return true;
      } catch (err) {
        console.error("Error initializing audio:", err);
        return false;
      }
    }
  }));


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL is not supported');
      return;
    }
    glRef.current = gl;

    const createShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    programRef.current = program;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1, 1, 1, 1, -1, -1, 1, -1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    uniformsRef.current.resolution = gl.getUniformLocation(program, 'u_resolution');
    uniformsRef.current.time = gl.getUniformLocation(program, 'u_time');
    uniformsRef.current.mouse = gl.getUniformLocation(program, 'u_mouse');
    uniformsRef.current.displacement_mix = gl.getUniformLocation(program, 'u_displacement_mix');
    uniformsRef.current.audio = gl.getUniformLocation(program, 'u_audio');

    const handleMouseMove = (event: MouseEvent) => {
        mousePosRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleMouseDown = () => { isMouseDownRef.current = true; };
    const handleMouseUp = () => { isMouseDownRef.current = false; };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    const render = (time: number) => {
      animationFrameIdRef.current = requestAnimationFrame(render);
      const now = time * 0.001; // convert to seconds
      const deltaTime = now - (lastTimeRef.current || now);
      lastTimeRef.current = now;

      const transitionSpeed = 1.5;
      const targetMix = isMouseDownRef.current ? 1.0 : 0.3;
      displacementMixRef.current += (targetMix - displacementMixRef.current) * transitionSpeed * deltaTime;
      displacementMixRef.current = Math.max(0.0, Math.min(1.0, displacementMixRef.current));

      if (analyserRef.current && audioDataRef.current && audioContextRef.current) {
        analyserRef.current.getByteFrequencyData(audioDataRef.current);
        const freqData = audioDataRef.current;
        const binCount = analyserRef.current.frequencyBinCount;

        const bassEnd = Math.floor(250 / (audioContextRef.current.sampleRate / 2) * binCount);
        const midEnd = Math.floor(4000 / (audioContextRef.current.sampleRate / 2) * binCount);

        let bass = 0, mid = 0, high = 0;
        for (let i = 0; i < binCount; i++) {
          const v = freqData[i] / 255.0;
          if (i <= bassEnd) bass += v;
          else if (i <= midEnd) mid += v;
          else high += v;
        }

        const bassCount = bassEnd + 1;
        const midCount = midEnd - bassEnd;
        const highCount = binCount - midEnd;

        audioLevelsRef.current = {
            bass: bassCount > 0 ? bass / bassCount : 0,
            mid: midCount > 0 ? mid / midCount : 0,
            high: highCount > 0 ? high / highCount : 0,
        };
      }

      const displayWidth  = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (canvas.width  !== displayWidth || canvas.height !== displayHeight) {
        canvas.width  = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      
      gl.uniform2f(uniformsRef.current.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniformsRef.current.time, now);
      gl.uniform2f(uniformsRef.current.mouse, mousePosRef.current.x, canvas.height - mousePosRef.current.y);
      gl.uniform1f(uniformsRef.current.displacement_mix, displacementMixRef.current);
      gl.uniform3f(uniformsRef.current.audio, audioLevelsRef.current.bass, audioLevelsRef.current.mid, audioLevelsRef.current.high);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    animationFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      if(audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if(glRef.current && programRef.current){
        glRef.current.deleteProgram(programRef.current);
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />;
};

export default forwardRef(MetaballCanvas);