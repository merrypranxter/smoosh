export function compileProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
  name: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc, `${name}.vert`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, `${name}.frag`);
  const prog = gl.createProgram();
  if (!prog) throw new Error("WebGL program allocation failed.");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "link error";
    gl.deleteProgram(prog);
    throw new Error(`Shader link failed (${name}): ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
  name: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("WebGL shader allocation failed.");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "compile error";
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed (${name}): ${log}`);
  }
  return sh;
}

export interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
  internal: number;
  format: number;
  type: number;
}

export function createTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  halfFloat: boolean,
  filter: number = gl.LINEAR,
): Target {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) throw new Error("WebGL framebuffer allocation failed.");

  const internal = halfFloat ? gl.RGBA16F : gl.RGBA;
  const format = gl.RGBA;
  const type = halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("WebGL framebuffer is incomplete on this device.");
  }
  return { tex, fbo, w, h, internal, format, type };
}

export function resizeTarget(
  gl: WebGL2RenderingContext,
  t: Target,
  w: number,
  h: number,
): void {
  if (t.w === w && t.h === h) return;
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, t.internal, w, h, 0, t.format, t.type, null);
  t.w = w;
  t.h = h;
}

export function createColorTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("WebGL texture allocation failed.");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );
  return tex;
}

export function destroyTarget(gl: WebGL2RenderingContext, t: Target | null): void {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}

export class PingPong {
  a: Target;
  b: Target;
  flag = false;
  constructor(a: Target, b: Target) {
    this.a = a;
    this.b = b;
  }
  read(): Target {
    return this.flag ? this.b : this.a;
  }
  write(): Target {
    return this.flag ? this.a : this.b;
  }
  swap(): void {
    this.flag = !this.flag;
  }
}

export function getUniformLocation(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  name: string,
): WebGLUniformLocation | null {
  return gl.getUniformLocation(prog, name);
}
