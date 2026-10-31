import { defaultFilterVert, Filter, GlProgram, type Texture } from 'pixi.js';

// Lights the map in one pass. Two screen-sized textures come in:
//   light: the colour and strength of the light falling on each pixel.
//   sight: r = darkvision or another sense, g = in sight now, b = explored.
// Darkvision turns dim light into bright and darkness into dim, in grey, as
// the rules say. Outside your sight the map is a faded memory, and where you
// have never been it is black. Sight is sampled a few times around each
// pixel so fog and darkvision edges are soft.

const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLight;
uniform sampler2D uSight;
uniform highp vec4 uInputSize;
uniform vec2 uScreen;
uniform float uFog;
uniform float uFloor;
uniform float uOpaque;
uniform vec3 uVoid;
uniform float uExploredBlur;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

vec3 sightAt(vec2 uv) {
  vec2 px = 3.0 / uScreen;
  vec3 s = texture(uSight, uv).rgb * 0.4;
  s += texture(uSight, uv + vec2(px.x, 0.0)).rgb * 0.15;
  s += texture(uSight, uv - vec2(px.x, 0.0)).rgb * 0.15;
  s += texture(uSight, uv + vec2(0.0, px.y)).rgb * 0.15;
  s += texture(uSight, uv - vec2(0.0, px.y)).rgb * 0.15;
  return s;
}

/** The edge of explored ground is blurred a little more than sight, so memory fades in softly. */
float exploredAt(vec2 uv) {
  vec2 px = uExploredBlur / uScreen;
  float e = 0.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++) e += texture(uSight, uv + vec2(float(x), float(y)) * px).b;
  return e / 9.0;
}

void main(void) {
  vec4 tex = texture(uTexture, vTextureCoord);
  vec4 c = vec4(tex.rgb + uVoid * (1.0 - tex.a) * uOpaque, mix(tex.a, 1.0, uOpaque));
  vec2 uv = vTextureCoord * uInputSize.xy / uScreen;
  vec3 light = min(texture(uLight, uv).rgb, vec3(1.25));
  vec3 sight = sightAt(uv);
  float grey = dot(c.rgb, LUMA);

  vec3 lit = c.rgb * light;
  vec3 dark = max(c.rgb * min(light * 2.0, vec3(1.0)), vec3(grey * 0.55));
  vec3 seen = mix(lit, max(lit, dark), sight.r);
  seen = max(seen, c.rgb * uFloor);

  vec3 memory = vec3(grey * 0.32) * vec3(0.92, 0.96, 1.08);
  vec3 fogged = mix(vec3(0.0), memory, exploredAt(uv));
  vec3 rgb = mix(seen, mix(fogged, seen, sight.g), uFog);
  finalColor = vec4(rgb, c.a);
}
`;

export interface LightingOptions {
  light: Texture;
  sight: Texture;
  /** 1 hides what you can't see; 0 only lights (tokens, the GM's view). */
  fog: number;
  /** The least light anything gets, as a share of its colour: keeps your own tokens readable. */
  floor: number;
  /** 1 for the bottom layer: empty space gets the void colour instead of staying see-through. */
  opaque: number;
}

export class LightingFilter extends Filter {
  constructor({ light, sight, fog, floor, opaque }: LightingOptions) {
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'vtt-lighting' }),
      resources: {
        lighting: {
          uScreen: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
          uFog: { value: fog, type: 'f32' },
          uFloor: { value: floor, type: 'f32' },
          uOpaque: { value: opaque, type: 'f32' },
          uVoid: { value: new Float32Array([0.106, 0.114, 0.133]), type: 'vec3<f32>' },
          uExploredBlur: { value: 4, type: 'f32' },
        },
        uLight: light.source,
        uSight: sight.source,
      },
    });
  }

  private get uniforms(): Record<string, unknown> {
    return (this.resources as { lighting: { uniforms: Record<string, unknown> } }).lighting.uniforms;
  }

  resize(w: number, h: number): void {
    const s = this.uniforms.uScreen as Float32Array;
    s[0] = w;
    s[1] = h;
  }

  set fog(value: number) {
    this.uniforms.uFog = value;
  }
}
