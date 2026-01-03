(() => {
  const backLayer = document.getElementById("clouds-back");
  const frontLayer = document.getElementById("clouds-front");
  const rainCanvas = document.getElementById("rain");

  if (!backLayer || !frontLayer || !rainCanvas) {
    return;
  }

  const shadow2 = document.getElementById("shadow2");
  const shadow3 = document.getElementById("shadow3");
  const shadow4 = document.getElementById("shadow4");
  const shadow5 = document.getElementById("shadow5");

  const userAgent = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/Chrome|Chromium|Edg|OPR|CriOS|FxiOS/.test(userAgent);
  const useLiteMode = isIOS || isSafari;
  if (useLiteMode) {
    document.documentElement.classList.add("safari-lite");
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || useLiteMode;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const lerp = (start, end, t) => start + (end - start) * t;
  const cloudConfig = useLiteMode
    ? {
        back: {
          count: 6,
          speed: 3.4,
          opacity: 0.5,
          scaleRange: [0.85, 1.05],
          yRange: [0.06, 0.45],
          sizeRange: [200, 360],
        },
        front: {
          count: 4,
          speed: 5.2,
          opacity: 0.7,
          scaleRange: [0.9, 1.15],
          yRange: [0.18, 0.68],
          sizeRange: [260, 460],
        },
      }
    : {
        back: {
          count: 9,
          speed: 4.8,
          opacity: 0.5,
          scaleRange: [0.85, 1.1],
          yRange: [0.05, 0.5],
          sizeRange: [240, 420],
        },
        front: {
          count: 6,
          speed: 7.4,
          opacity: 0.75,
          scaleRange: [0.9, 1.25],
          yRange: [0.15, 0.72],
          sizeRange: [320, 560],
        },
      };

  class CloudLayer {
    constructor(container, options) {
      this.container = container;
      this.baseCount = options.count;
      this.baseSpeed = options.speed;
      this.layerOpacity = options.opacity;
      this.scaleRange = options.scaleRange;
      this.yRange = options.yRange;
      this.sizeRange = options.sizeRange;
      this.clouds = [];
      this.targetCount = this.baseCount;
      this.windFactor = 0.6;
      this.lightFactor = 0.9;
      this.width = 0;
      this.height = 0;
    }

    resize(width, height) {
      this.width = width;
      this.height = height;
      this.clear();
    }

    clear() {
      this.clouds.forEach((cloud) => {
        if (cloud.el.parentNode === this.container) {
          this.container.removeChild(cloud.el);
        }
      });
      this.clouds = [];
    }

    setDensity(density) {
      this.targetCount = Math.max(3, Math.round(this.baseCount * density));
    }

    setWind(windFactor) {
      this.windFactor = windFactor;
    }

    setLight(lightFactor) {
      this.lightFactor = lightFactor;
    }

    createCloud(startLeft) {
      const cloud = {
        el: document.createElement("div"),
        width: 0,
        height: 0,
        scale: 1,
        x: 0,
        y: 0,
        speed: 0,
        opacity: 1,
      };
      cloud.el.className = "cloud-shape";
      this.container.appendChild(cloud.el);
      this.resetCloud(cloud, startLeft);
      return cloud;
    }

    resetCloud(cloud, startLeft) {
      const width = rand(this.sizeRange[0], this.sizeRange[1]);
      const height = width * rand(0.35, 0.55);
      const scale = rand(this.scaleRange[0], this.scaleRange[1]);
      const renderWidth = width * scale;

      cloud.width = width;
      cloud.height = height;
      cloud.scale = scale;
      cloud.x = startLeft ? rand(-renderWidth, this.width) : -renderWidth - rand(80, 260);
      cloud.y = rand(this.yRange[0] * this.height, this.yRange[1] * this.height);
      cloud.speed = this.baseSpeed * this.windFactor * rand(0.6, 1.2);
      cloud.opacity = rand(0.45, 0.95);

      cloud.el.style.width = `${width}px`;
      cloud.el.style.height = `${height}px`;
    }

    populate() {
      while (this.clouds.length < this.targetCount) {
        this.clouds.push(this.createCloud(true));
      }
      while (this.clouds.length > this.targetCount) {
        const cloud = this.clouds.pop();
        if (cloud && cloud.el.parentNode === this.container) {
          this.container.removeChild(cloud.el);
        }
      }
    }

    update(dt) {
      this.populate();
      const bounds = this.width + 320;
      this.clouds.forEach((cloud) => {
        cloud.x += cloud.speed * dt;
        const renderWidth = cloud.width * cloud.scale;
        if (cloud.x > bounds + renderWidth) {
          this.resetCloud(cloud, false);
        }
        cloud.el.style.transform = `translate3d(${cloud.x}px, ${cloud.y}px, 0) scale(${cloud.scale})`;
        cloud.el.style.opacity = (cloud.opacity * this.layerOpacity * this.lightFactor).toFixed(3);
      });
    }

    renderStatic() {
      this.populate();
      this.clouds.forEach((cloud) => {
        cloud.el.style.transform = `translate3d(${cloud.x}px, ${cloud.y}px, 0) scale(${cloud.scale})`;
        cloud.el.style.opacity = (cloud.opacity * this.layerOpacity * this.lightFactor).toFixed(3);
      });
    }
  }

  class RainField {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.drops = [];
      this.targetCount = 0;
      this.intensity = 0;
      this.width = 0;
      this.height = 0;
    }

    resize(width, height, ratio) {
      this.width = width;
      this.height = height;
      this.canvas.width = width * ratio;
      this.canvas.height = height * ratio;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.drops = [];
      this.clear();
    }

    clear() {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }

    setIntensity(intensity) {
      this.intensity = clamp(intensity, 0, 1);
      this.targetCount = Math.round(20 + 160 * this.intensity);
      if (this.intensity === 0) {
        this.drops = [];
        this.clear();
      }
    }

    spawnDrop() {
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        length: rand(12, 28),
        speed: rand(240, 420),
        opacity: rand(0.12, 0.26),
      };
    }

    update(dt) {
      if (this.intensity <= 0) {
        return;
      }

      while (this.drops.length < this.targetCount) {
        this.drops.push(this.spawnDrop());
      }
      while (this.drops.length > this.targetCount) {
        this.drops.pop();
      }

      this.drops.forEach((drop) => {
        drop.y += drop.speed * dt;
        drop.x += 30 * dt;
        if (drop.y > this.height + 20) {
          drop.y = -20;
          drop.x = Math.random() * this.width;
        }
      });
    }

    draw() {
      if (this.intensity <= 0) {
        this.clear();
        return;
      }

      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      this.drops.forEach((drop) => {
        ctx.strokeStyle = `rgba(255, 255, 255, ${drop.opacity})`;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + 6, drop.y + drop.length);
        ctx.stroke();
      });
    }
  }

  class SkyScene {
    constructor() {
      this.layers = [
        new CloudLayer(backLayer, cloudConfig.back),
        new CloudLayer(frontLayer, cloudConfig.front),
      ];
      this.rain = new RainField(rainCanvas);
      this.lastFrame = 0;
      this.running = false;
      this.reducedMotion = prefersReducedMotion;
      this.setConditions({ cloudCover: 0.4, windSpeed: 6, isNight: false, isRaining: false });
    }

    resize(width, height, ratio) {
      this.layers.forEach((layer) => layer.resize(width, height));
      this.rain.resize(width, height, ratio);
      if (this.reducedMotion) {
        this.renderStatic();
      }
    }

    updateFilterLighting(cover, isNight) {
      const t = clamp(cover, 0, 1);
      const nightFactor = isNight ? 0.65 : 1;
      const shadow2Opacity = lerp(0.05, 0.32, t) * nightFactor;
      const shadow3Opacity = lerp(0.1, 0.42, t) * nightFactor;
      const shadow4Opacity = lerp(0.18, 0.6, t) * nightFactor;
      const shadow5Opacity = lerp(0.22, 0.68, t) * nightFactor;

      if (shadow2) {
        shadow2.setAttribute("flood-opacity", shadow2Opacity.toFixed(3));
      }
      if (shadow3) {
        shadow3.setAttribute("flood-opacity", shadow3Opacity.toFixed(3));
      }
      if (shadow4) {
        shadow4.setAttribute("flood-opacity", shadow4Opacity.toFixed(3));
      }
      if (shadow5) {
        shadow5.setAttribute("flood-opacity", shadow5Opacity.toFixed(3));
      }
    }

    // Translate weather conditions into cloud density, speed, and light.
    setConditions({ cloudCover, windSpeed, isNight, isRaining, rainIntensity }) {
      const cover = clamp(cloudCover ?? 0.4, 0, 1);
      const wind = windSpeed != null ? clamp(windSpeed / 18, 0.2, 1.4) : 0.6;
      const light = isNight ? 0.65 : 0.9 - cover * 0.25;

      this.layers.forEach((layer, index) => {
        const density = index === 0 ? 0.4 + cover * 0.7 : 0.3 + cover * 0.9;
        layer.setDensity(density);
        layer.setWind(wind * (index === 0 ? 0.75 : 1));
        layer.setLight(light);
      });

      const rainLevel = isRaining ? (rainIntensity ?? (0.3 + cover * 0.4)) : 0;
      this.rain.setIntensity(this.reducedMotion ? 0 : rainLevel);

      this.updateFilterLighting(cover, isNight);

      if (this.reducedMotion) {
        this.renderStatic();
      }
    }

    start() {
      if (this.reducedMotion) {
        this.renderStatic();
        return;
      }
      this.running = true;
      requestAnimationFrame(this.tick.bind(this));
    }

    tick(timestamp) {
      if (!this.running) {
        return;
      }
      if (!this.lastFrame) {
        this.lastFrame = timestamp;
      }
      const dt = Math.min(0.05, (timestamp - this.lastFrame) / 1000);
      this.lastFrame = timestamp;

      this.layers.forEach((layer) => layer.update(dt));
      this.rain.update(dt);

      this.rain.draw();
      requestAnimationFrame(this.tick.bind(this));
    }

    renderStatic() {
      this.layers.forEach((layer) => layer.renderStatic());
      this.rain.draw();
    }
  }

  const scene = new SkyScene();
  window.DashboardSky = scene;

  const handleResize = () => {
    scene.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  };

  window.addEventListener("resize", handleResize);
  handleResize();
  scene.start();
})();
