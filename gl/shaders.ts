export const vertexShaderSource = `
    attribute vec4 a_position;
    void main() {
        gl_Position = a_position;
    }
`;

export const fragmentShaderSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;
    uniform float u_displacement_mix;
    uniform vec3 u_audio; // x: bass, y: mid, z: high

    // Smooth minimum function to blend shapes
    float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
    }
    
    // 3D noise function (psuedo-random)
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f*f*(3.0-2.0*f);
        float n = p.x + p.y*7.0 + 33.0*p.z;
        return mix(mix(mix( hash(n+0.0), hash(n+1.0),f.x),
                       mix( hash(n+57.0), hash(n+58.0),f.x),f.y),
                   mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                       mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
    }

    // Fractal Brownian Motion for more detailed noise
    float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 1.2;
        float frequency = 0.9;
        for (int i = 0; i < 6; i++) {
            value += amplitude * noise(p * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    // Signed Distance Function for the scene
    float map(vec3 p) {
        // Metaball 1
        vec3 p1 = vec3(sin(u_time * 0.6 + 80.0) * (u_audio.x * 3.0), cos(u_time * 0.5) * 0.8, sin(u_time * 0.3) * 0.8);
        float d1 = length(p - p1) - 0.75;

        // Metaball 2
        vec3 p2 = vec3(cos(u_time * 3.4) * (u_audio.x * 3.0), sin(u_time * 0.8 + 3.14) * 0.9, cos(u_time * 0.6) * 0.9);
        float d2 = length(p - p2) - 0.95;
        
        // Metaball 3
        vec3 p3 = vec3(sin(u_time * 0.6 + 4.5) * (u_audio.x * 3.0), cos(u_time * 0.3) * 0.7, sin(u_time * 0.75 + 0.5) * 0.7);
        float d3 = length(p - p3) - 0.55;

        // Metaball 4
        vec3 p4 = vec3(cos(u_time * 5.55 + 4.0) * (u_audio.x * 3.0), sin(u_time * 0.65) * 0.85, cos(u_time * 0.85 + 5.0) * 0.85);
        float d4 = length(p - p4) - 0.70;

        // Metaball 5
        vec3 p5 = vec3(sin(u_time * 0.8 + 2.0) * (u_audio.x * 3.0), cos(u_time * 0.9) * 0.6, sin(u_time * 0.5 + 1.0) * 0.6);
        float d5 = length(p - p5) - 0.45;

        // Metaball 6
        vec3 p6 = vec3(cos(u_time * 2.1 + 1.0) * (u_audio.x * 3.0), sin(u_time * 1.2 + 4.5) * 0.7, cos(u_time * 0.7) * 0.7);
        float d6 = length(p - p6) - 0.65;

        // Metaball 7
        vec3 p7 = vec3(sin(u_time * 1.5 + 6.0) * (u_audio.x * 3.0), cos(u_time * 1.1) * 0.9, sin(u_time * 0.9 + 2.5) * 0.9);
        float d7 = length(p - p7) - 0.8;

        // Metaball 8
        vec3 p8 = vec3(cos(u_time * 4.2 + 3.0) * 1.5, sin(u_time * 1.3) * 0.75, cos(u_time * 1.0 + 6.0) * 0.75);
        float d8 = length(p - p8) - 0.6;
        
        // Blend them together, bass makes the blend sharper
        float blendFactor = 0.6 + u_audio.x * 1.7;
        float res = smin(d1, d2, blendFactor);
        res = smin(res, d3, blendFactor);
        res = smin(res, d4, blendFactor);
        res = smin(res, d5, blendFactor);
        res = smin(res, d6, blendFactor);
        res = smin(res, d7, blendFactor);
        res = smin(res, d8, blendFactor);

        // Calculate geometric displacement
        // Highs make the displacement stronger, mids make it faster
        float strength = (0.2 + u_audio.z * 2.8 );
        float scale = 1.5 + u_audio.y * 1.45;
        float speed = 3.05 + u_audio.z * 0.6 ;
        float displacement = fbm(p * scale + ((u_audio.z * u_audio.x) + sin(u_time * 1.0 + 1.0)) * speed) * strength;
        
        // Apply displacement smoothly using the mix uniform
        return res - displacement * ( u_audio.x * 0.4);
    }

    // Calculate normal using gradient of the SDF
    vec3 getNormal(vec3 p) {
        vec2 e = vec2(0.001, 0.0);
        // The normal is now automatically calculated for the deformed surface
        return normalize(vec3(
            map(p + e.xyy) - map(p - e.xyy),
            map(p + e.yxy) - map(p - e.yxy),
            map(p + e.yyx) - map(p - e.yyx)
        ));
    }

    // Main raymarching function
    float rayMarch(vec3 ro, vec3 rd, out int steps) {
        float d = 0.0;
        for (int i = 0; i < 100; i++) {
            steps = i;
            vec3 p = ro + rd * d;
            float dist = map(p);
            if (dist < 0.0001) return d;
            d += dist;
            if (d > 20.0) return -1.0;
        }
        return -1.0;
    }

    void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
        vec2 mouse = (u_mouse * 2.0 - u_resolution.xy) / u_resolution.y;
        if(u_mouse.x == 0.0 && u_mouse.y == 0.0){
          mouse = vec2(0.0);
        }

        // Camera setup
        vec3 ro = vec3(mouse.x * 1.0, mouse.y * 0.5, 6.0);
        vec3 lookAt = vec3(0.0, 0.0, 0.0);
        vec3 f = normalize(lookAt - ro);
        vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
        vec3 u = cross(f, r);
        vec3 rd = normalize(f + uv.x * r + uv.y * u);

        // Raymarch the scene
        int steps;
        float d = rayMarch(ro, rd, steps);

        // Background color
        vec3 col = vec3(0.01, 0.02, 0.04) + 0.05 * abs(uv.y);

        if (d > 0.0) {
            vec3 p = ro + rd * d;
            vec3 n = getNormal(p);
            vec3 lightPos = vec3(2.0, 3.0, 5.0);
            lightPos.xz += vec2(sin(u_time*0.2), cos(u_time*0.2))*2.0;

            vec3 lightDir = normalize(lightPos - p);
            
            // Lighting
            float diffuse = max(dot(n, lightDir), ((u_audio.z + u_audio.y) * 3.0));
            
            vec3 viewDir = normalize(ro - p);
            vec3 reflectDir = reflect(-lightDir, n);
            float specular = pow(max(dot(viewDir, reflectDir), 0.0), 14.0);
            
            // Fresnel for metallic rim lighting
            float fresnel = pow(0.4 + dot(viewDir, n), 2.0);

            // Fake environment reflection
            vec3 reflectedRay = reflect(rd, n);
            float env = 0.5 + 0.5 * reflectedRay.y;

            // Final color composition
            vec3 baseColor = vec3(0.1, 0.1, 0.1);
            baseColor.r += u_audio.z * 0.65; // Bass adds a magenta tint
            baseColor.g += u_audio.y * 0.5; // Mids add a green tint
            baseColor.b += u_audio.x * 0.7; // Mids add a green tint

            col = baseColor * (diffuse * 0.1 + 0.1); // Ambient + Diffuse
            col += vec3(1.0) * specular * (u_audio.x * 0.8); // Specular highlights
            col += baseColor * fresnel * (u_audio.x * 1.8); // Fresnel reflections
            col = mix(col, vec3(0.8, (1.5 + u_audio.z * 0.2), 1.0), env * 0.3); // Environment reflection
            col += u_audio.z * -0.6; // Highs add a bright flash
        }
        
        // Vignette effect
        col *= 1.0 - 0.5 * dot(uv, uv);

        gl_FragColor = vec4(col, 1.0);
    }
`;