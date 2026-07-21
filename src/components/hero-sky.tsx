"use client";

import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[8];
uniform vec4 u_scene;
uniform vec4 u_shape;
uniform vec4 u_surface;
uniform vec4 u_transform;
uniform vec4 u_space;
uniform vec4 u_cursor;

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_warp u_shape.z
#define u_detail u_shape.w
#define u_contrast u_surface.x
#define u_brightness u_surface.y
#define u_saturation u_surface.z
#define u_vignette u_surface.w
#define u_seed u_transform.x
#define u_rotate u_transform.y
#define u_drift u_transform.z
#define u_viewportHeight u_transform.w
#define u_offset u_space.xy
#define u_mouse u_space.zw
#define u_cursorPresence u_cursor.x
#define u_cursorStrength u_cursor.y
#define u_cursorRadius u_cursor.z

float hash21(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

vec3 palette(float x) {
  float count = max(u_colorCount - 1.0, 1.0);
  float position = clamp(x, 0.0, 1.0) * count;
  vec3 color = u_colors[0];

  for (int i = 0; i < 7; i++) {
    if (float(i) < count) {
      float blend = smoothstep(
        0.0,
        1.0,
        clamp(position - float(i), 0.0, 1.0)
      );
      color = mix(color, u_colors[i + 1], blend);
    }
  }

  return color;
}

vec3 shade(vec2 uv, vec2 p, float time) {
  float wave = sin(
    uv.x * (3.0 + u_intensity * 9.0) +
    time * 0.8
  ) * 0.08;
  float texture = (
    fbm(p * 2.0 + time * 0.1) - 0.5
  ) * u_intensity * 0.6;
  return palette(uv.y + wave + texture);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 screenUv = uv;
  float pageY = max(
    0.0,
    (u_resolution.y - gl_FragCoord.y) / max(u_viewportHeight, 1.0)
  );
  float paletteY;

  if (pageY <= 1.0) {
    // Preserve the hero's original dark-to-light sweep.
    paletteY = 1.0 - pageY;
  } else {
    // Reverse after the hero, then mirror through the darker portion of the
    // palette so the shader remains continuous without washing out content.
    float postHeroY = pageY - 1.0;
    float mirroredY = 1.0 - abs(mod(postHeroY, 2.0) - 1.0);
    float postHeroPalette = 0.55 + mirroredY * 0.45;
    paletteY = mix(
      0.0,
      postHeroPalette,
      smoothstep(0.0, 0.95, postHeroY)
    );
  }
  vec2 p = (
    gl_FragCoord.xy - 0.5 * u_resolution.xy
  ) / min(u_resolution.x, u_resolution.y);

  if (u_cursorPresence > 0.001) {
    vec2 cursor = (
      0.5 * u_mouse * u_resolution.xy
    ) / min(u_resolution.x, u_resolution.y);
    vec2 delta = p - cursor;
    float distanceFromCursor = length(delta);
    float mask = u_cursorPresence * (
      1.0 - smoothstep(0.0, u_cursorRadius, distanceFromCursor)
    );
    float angle = mask * u_cursorStrength * 2.2;
    float cosine = cos(angle);
    float sine = sin(angle);
    p = cursor + mat2(cosine, -sine, sine, cosine) * delta;
  }

  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
  uv.y = paletteY;
  p *= u_scale;

  float rotationCosine = cos(u_rotate);
  float rotationSine = sin(u_rotate);
  p = mat2(
    rotationCosine,
    -rotationSine,
    rotationSine,
    rotationCosine
  ) * p;
  p += u_offset;
  p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));

  p += u_warp * (
    vec2(
      fbm(p * u_detail + u_seed),
      fbm(p * u_detail + vec2(5.2, 1.3))
    ) - 0.5
  );

  vec3 color = shade(uv, p, u_time);
  color = (color - 0.5) * u_contrast + 0.5;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, u_saturation);
  color += u_brightness;

  float vignetteDistance = length(screenUv - 0.5) * 1.41421356;
  color *= 1.0 - u_vignette * smoothstep(
    0.35,
    1.0,
    vignetteDistance
  );

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const HERO_UNIFORMS = {
  colors: [
    [1, 0.945, 0.843],
    [0.953, 0.757, 0.49],
    [0.875, 0.49, 0.231],
    [0.643, 0.263, 0.157],
    [0.263, 0.125, 0.086],
    [0.263, 0.125, 0.086],
    [0.263, 0.125, 0.086],
    [0.263, 0.125, 0.086],
  ] as [number, number, number][],
  colorCount: 5,
  scale: 1.88,
  intensity: 0.39,
  warp: 0.29,
  detail: 1.72,
  contrast: 0.96,
  brightness: 0.015,
  saturation: 1.08,
  vignette: 0,
  seed: 3165,
  rotate: 3.4034,
  offsetX: 0.1,
  offsetY: -0.18,
  drift: 0.2,
  cursorStrength: 0.035,
  cursorRadius: 0.46,
  timeScale: 1.25,
};

const pendingContextReleases = new WeakMap<HTMLCanvasElement, number>();

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);

  if (!shader) {
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

type HeroSkyProps = {
  className?: string;
  shaderRevision?: string;
};

export function HeroSky({
  className,
  shaderRevision = "default",
}: HeroSkyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const pendingRelease = pendingContextReleases.get(canvas);
    if (pendingRelease !== undefined) {
      window.clearTimeout(pendingRelease);
      pendingContextReleases.delete(canvas);
    }

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });

    if (!gl) {
      return;
    }

    const activeCanvas = canvas;
    const context = gl;
    const config = HERO_UNIFORMS;

    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      VERTEX_SHADER,
    );
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER,
    );

    if (!vertexShader || !fragmentShader) {
      return;
    }

    const program = gl.createProgram();

    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    const buffer = gl.createBuffer();
    const positionLocation = gl.getAttribLocation(program, "a_position");

    if (!buffer || positionLocation < 0) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      colors: gl.getUniformLocation(program, "u_colors"),
      scene: gl.getUniformLocation(program, "u_scene"),
      shape: gl.getUniformLocation(program, "u_shape"),
      surface: gl.getUniformLocation(program, "u_surface"),
      transform: gl.getUniformLocation(program, "u_transform"),
      space: gl.getUniformLocation(program, "u_space"),
      cursor: gl.getUniformLocation(program, "u_cursor"),
    };

    gl.uniform3fv(
      uniforms.colors,
      new Float32Array(config.colors.flat()),
    );
    gl.uniform4f(
      uniforms.shape,
      config.scale,
      config.intensity,
      config.warp,
      config.detail,
    );
    gl.uniform4f(
      uniforms.surface,
      config.contrast,
      config.brightness,
      config.saturation,
      config.vignette,
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let bounds = canvas.getBoundingClientRect();
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let pointerPresence = 0;
    let targetPresence = 0;
    let animationFrame = 0;
    let elapsed = 19;
    let previousTime: number | null = null;
    let inView = true;
    let visible = document.visibilityState === "visible";
    let disposed = false;

    const resize = () => {
      bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rawWidth = Math.max(1, Math.round(bounds.width * ratio));
      const rawHeight = Math.max(1, Math.round(bounds.height * ratio));
      const pixelScale = Math.min(
        1,
        Math.sqrt(2_000_000 / Math.max(1, rawWidth * rawHeight)),
      );
      const width = Math.max(1, Math.round(rawWidth * pixelScale));
      const height = Math.max(1, Math.round(rawHeight * pixelScale));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const requestRender = () => {
      if (!disposed && visible && inView && animationFrame === 0) {
        animationFrame = requestAnimationFrame(render);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      bounds = canvas.getBoundingClientRect();
      const inside =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (!inside || bounds.width === 0 || bounds.height === 0) {
        targetPresence = 0;
        requestRender();
        return;
      }

      targetX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      targetY = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
      targetPresence = 1;
      requestRender();
    };

    const clearPointer = () => {
      targetPresence = 0;
      requestRender();
    };

    const updateLayout = () => {
      resize();
      requestRender();
    };

    function render(time: number) {
      animationFrame = 0;

      if (disposed || !visible || !inView) {
        return;
      }

      const delta =
        previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;

      if (!reducedMotion) {
        elapsed += delta * config.timeScale;
      }

      const follow = 1 - Math.exp(-10 * delta);
      pointerX += (targetX - pointerX) * follow;
      pointerY += (targetY - pointerY) * follow;
      pointerPresence += (targetPresence - pointerPresence) * follow;

      resize();
      context.uniform4f(
        uniforms.scene,
        activeCanvas.width,
        activeCanvas.height,
        elapsed,
        config.colorCount,
      );
      context.uniform4f(
        uniforms.transform,
        config.seed,
        config.rotate,
        config.drift,
        Math.max(
          1,
          (window.innerHeight / Math.max(bounds.height, 1)) *
            activeCanvas.height,
        ),
      );
      context.uniform4f(
        uniforms.space,
        config.offsetX,
        config.offsetY,
        pointerX,
        pointerY,
      );
      context.uniform4f(
        uniforms.cursor,
        pointerPresence,
        config.cursorStrength,
        config.cursorRadius,
        0,
      );
      context.drawArrays(context.TRIANGLES, 0, 3);

      const pointerSettling =
        Math.abs(targetX - pointerX) > 0.001 ||
        Math.abs(targetY - pointerY) > 0.001 ||
        Math.abs(targetPresence - pointerPresence) > 0.001;

      if (!reducedMotion || pointerSettling) {
        requestRender();
      } else {
        previousTime = null;
      }
    }

    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      if (inView) {
        requestRender();
      } else if (animationFrame !== 0) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        previousTime = null;
      }
    });
    intersectionObserver.observe(canvas);

    const handleVisibilityChange = () => {
      visible = document.visibilityState === "visible";
      if (visible) {
        requestRender();
      } else if (animationFrame !== 0) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        previousTime = null;
      }
    };

    window.addEventListener("resize", updateLayout);
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointercancel", clearPointer);
    window.addEventListener("blur", clearPointer);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.documentElement.addEventListener("pointerleave", clearPointer);
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointercancel", clearPointer);
      window.removeEventListener("blur", clearPointer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.documentElement.removeEventListener("pointerleave", clearPointer);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      const releaseTimer = window.setTimeout(() => {
        if (pendingContextReleases.get(canvas) !== releaseTimer) {
          return;
        }
        pendingContextReleases.delete(canvas);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        canvas.width = 1;
        canvas.height = 1;
      }, 0);
      pendingContextReleases.set(canvas, releaseTimer);
    };
  // Recompile when a shader revision changes during Fast Refresh. Otherwise
  // CSS can update while the canvas keeps its previous WebGL program.
  }, [shaderRevision]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
