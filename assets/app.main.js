class CodeScanner {
  constructor(config = {}) {
    this.config = {
      showContour: config.showContour !== false,
      contourColor: config.contourColor || '#FFD22B',
      showResult: config.showResult !== false,
      resultColor: config.resultColor || '#FFD22B',
      isBeepActive: config.isBeepActive || true,
      onClickResult: config.onClickResult || this.copyLastResult,
      throttleZXingMs: config.throttleZXingMs || 500,
    };

    this.lastZXingAt = 0;
    this.workerBusy = false;
    this.currentCodes = new Map();
    this.lastBarcodeResult = null;
    this.beepSound = new Audio('assets/beep.mp3');

    this.qrScanner = document.getElementById('qr-scanner');

    if (!this.qrScanner) {
      throw new Error('Elemento não encontrado.');
    } else {

      this.video = document.createElement('video');
      this.qrScanner.appendChild(this.video);
      this.video.addEventListener('click', this.handleScreenClick);

      this.canvas = document.createElement('canvas');
      this.qrScanner.appendChild(this.canvas);
    }
  }

  init = () => {
    this.start();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').then((registration) => {
          console.log('Service Worker registrado com sucesso:', registration.scope);
          this.requestNotificationPermission();
        }).catch((error) => {
          console.error('Falha no registro do Service Worker:', error);
        });
      });
    }
    return this;
  };

  setupWorker = () => {
    this.worker = new Worker('./assets/app.worker.js');
    this.worker.onmessage = (e) => {
      this.workerBusy = false;
      const { ok, text, points, format } = e.data || {};

      if (ok) {
        const isNewCode = !this.currentCodes.has(text);

        this.lastBarcodeResult = {
          data: text,
          location: points,
          format: format,
          timestamp: performance.now()
        };

        if (isNewCode) {
          this.config.isBeepActive && this.beepSound.play().catch(e => console.error('Falha ao tocar o áudio:', e));

          if (Notification.permission === 'granted')
            new Notification(`Novo Código do tipo ${format}!`, {
              body: text,
              vibrate: [200, 100, 200],
              icon: "https://cdn.isaque.it/assets/icons/qrcode_ideyou_192.png"
            });
        }
      } else {
        this.lastBarcodeResult = null;
      }
    };
  };

  start = () => {
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        focusMode: "continuous",
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 60 }
      }
    })
      .then(stream => {
        this.video.addEventListener('play', () => {
          this.setupWorker();
          this.scanLoop();
        });

        this.video.controls = false;
        this.video.autoplay = true;
        this.video.playsInline = true;
        this.video.srcObject = stream;

        this.canvas.style.display = 'none';

        setTimeout(() => {
          this.qrScanner.className = 'on';
        }, 500);
      })
      .catch(err => console.error('Error accessing camera:', err));
  };

  handleScreenClick = async () => {
    if (!this.video.srcObject) return;

    try {
      const track = this.video.srcObject.getVideoTracks()[0];
      const capabilities = track.getCapabilities();

      // Verifica se a câmera suporta o foco de disparo único (single-shot)
      if (capabilities.focusMode && capabilities.focusMode.includes('single-shot')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
        console.log('Tentando foco de disparo único.');
      } else {
        // Se o single-shot não for suportado, vamos apenas logar que a câmera já está em foco contínuo.
        console.log('A câmera não suporta foco de disparo único, mas o foco contínuo já está ativado.');
      }

    } catch (err) {
      console.error('Falha ao tentar focar a câmera:', err);
    }
  };

  createCodeElements = (data, type) => {
    const contour = document.createElement('div');
    contour.className = type === 11 ? 'contour qr' : 'contour bar';
    contour.dataset.text = data;
    contour.addEventListener('click', () => this.config.onClickResult(data));
    this.qrScanner.appendChild(contour);

    const result = document.createElement('div');
    result.className = type === 11 ? 'result qr' : 'result bar';
    result.dataset.text = data;
    result.addEventListener('click', () => this.config.onClickResult(data));
    this.qrScanner.appendChild(result);

    return { contour, result };
  };

  drawAndShowResults = () => {
    const codesInThisFrame = new Set(this.currentCodes.keys());

    const allElements = [...this.qrScanner.querySelectorAll('[data-text]')];
    const elementsToRemove = allElements.filter(el => !codesInThisFrame.has(el.dataset.text));
    elementsToRemove.forEach(el => el.remove());

    let index = 1;
    this.currentCodes.forEach((code, id) => {
      let { location, data, format } = code;

      let contourElement = this.qrScanner.querySelector(`.contour[data-text="${data}"]`);
      let resultElement = this.qrScanner.querySelector(`.result[data-text="${data}"]`);

      if (!contourElement || !resultElement) {
        const newElements = this.createCodeElements(data, format);
        contourElement = newElements.contour;
        resultElement = newElements.result;
      }

      contourElement.dataset.id = index;
      resultElement.dataset.id = index;

      const locationKey = JSON.stringify(location);
      if (code.lastLocationKey === locationKey) {
        index++;
        return;
      }
      code.lastLocationKey = locationKey;

      if (format === 11 && this.config.showContour) {
        const BORDER_OFFSET = 50;

        const minX = Math.min(...location.map(p => p.x));
        const minY = Math.min(...location.map(p => p.y));
        const maxX = Math.max(...location.map(p => p.x));
        const maxY = Math.max(...location.map(p => p.y));

        const contourLeft = minX - BORDER_OFFSET;
        const contourTop = minY - BORDER_OFFSET;
        const contourWidth = (maxX - minX) + (BORDER_OFFSET * 2);
        const contourHeight = (maxY - minY) + (BORDER_OFFSET * 2);

        contourElement.style.left = `${contourLeft}px`;
        contourElement.style.top = `${contourTop}px`;
        contourElement.style.width = `${contourWidth}px`;
        contourElement.style.height = `${contourHeight}px`;
        contourElement.style.borderColor = this.config.contourColor;

        resultElement.innerText = data;
        resultElement.style.left = `${contourLeft}px`;
        resultElement.style.top = `${contourTop + contourHeight}px`;
        resultElement.style.width = `calc(${contourWidth}px - 0.5em)`;
        resultElement.style.backgroundColor = this.config.resultColor;
      }
      else if (this.config.showContour) {
        const minX = Math.min(...location.map(p => p.x));
        const minY = Math.min(...location.map(p => p.y));
        const maxX = Math.max(...location.map(p => p.x));
        const maxY = Math.max(...location.map(p => p.y));

        const barcodeHeight = (maxX - minX) / 5;

        contourElement.style.left = `${minX}px`;
        contourElement.style.top = `${minY + (barcodeHeight / 2)}px`;
        contourElement.style.width = `${maxX - minX}px`;
        contourElement.style.height = `30px`;

        resultElement.innerText = data;
        resultElement.style.left = `${minX}px`;
        resultElement.style.top = `${minY}px`;
        resultElement.style.width = `calc(${maxX - minX}px - 0.5em)`;
      }
      index++;
    });

    this.lastData = this.currentCodes.size > 0 ? this.currentCodes.values().next().value.data : '';
  };

  scanLoop = () => {
    if (this.video.paused || this.video.ended) {
      return;
    }

    const containerWidth = this.qrScanner.offsetWidth;
    const containerHeight = this.qrScanner.offsetHeight;
    this.canvas.width = containerWidth;
    this.canvas.height = containerHeight;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const videoAspectRatio = this.video.videoWidth / this.video.videoHeight;
    const canvasAspectRatio = this.canvas.width / this.canvas.height;
    let dx = 0, dy = 0, dWidth = this.canvas.width, dHeight = this.canvas.height;

    if (videoAspectRatio > canvasAspectRatio) {
      dWidth = this.canvas.height * videoAspectRatio;
      dx = (this.canvas.width - dWidth) / 2;
    } else {
      dHeight = this.canvas.width / videoAspectRatio;
      dy = (this.canvas.height - dHeight) / 2;
    }

    ctx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight, dx, dy, dWidth, dHeight);

    const now = performance.now();
    const newCurrentCodes = new Map();

    if (this.lastBarcodeResult && (now - this.lastBarcodeResult.timestamp) < this.config.throttleZXingMs + 50) {
      newCurrentCodes.set(this.lastBarcodeResult.data, this.lastBarcodeResult);
    }

    let imageData = null;

    if (!this.workerBusy && (now - this.lastZXingAt) >= this.config.throttleZXingMs) {
      imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.workerBusy = true;
      this.lastZXingAt = now;
      this.worker.postMessage({
        cmd: 'decode',
        width: imageData.width,
        height: imageData.height,
        data: imageData.data.buffer
      }, [imageData.data.buffer]);
    }

    const RETAIN_MS = 800;

    this.currentCodes.forEach((code, key) => {
      if (!newCurrentCodes.has(key)) {
        if (!code.lastSeen) code.lastSeen = now;
        if (now - code.lastSeen < RETAIN_MS) {
          newCurrentCodes.set(key, code);
        }
      } else {
        newCurrentCodes.get(key).lastSeen = now;
      }
    });

    this.currentCodes = newCurrentCodes;

    this.drawAndShowResults();
    requestAnimationFrame(this.scanLoop);
  };

  close = () => {
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    this.qrScanner.innerHTML = '';
    this.qrScanner.className = 'off';
  }

  requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('Permissão para notificações concedida.');
      } else {
        alert('Permissão para notificações negada.');
      }
    }
  };

  copyLastResult = async (dataStr) => {
    let code = 400
    try {
      await navigator.clipboard.writeText(dataStr);
      const contour = this.qrScanner.querySelector(`.contour[data-text="${dataStr}"]`);
      if (contour) {
        contour.style.borderColor = '#33CC66';
        setTimeout(() => contour.style.borderColor = this.config.contourColor, 2500);
      }
      const result = this.qrScanner.querySelector(`.result[data-text="${dataStr}"]`);
      if (result) {
        result.style.backgroundColor = '#33CC66';
        setTimeout(() => result.style.backgroundColor = this.config.resultColor, 2500);
      }
      console.log('Text copied to clipboard');
      code = 200;
    } catch (err) {
      const contour = this.qrScanner.querySelector(`.contour[data-text="${dataStr}"]`);
      if (contour) {
        contour.style.borderColor = '#FF5356';
        setTimeout(() => contour.style.borderColor = this.config.contourColor, 2500);
      }
      const result = this.qrScanner.querySelector(`.result[data-text="${dataStr}"]`);
      if (result) {
        result.style.backgroundColor = '#FF5356';
        setTimeout(() => result.style.backgroundColor = this.config.resultColor, 2500);
      }
      console.error('Failed to copy text: ', err);
      code = 500;
    }
    return code;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new CodeScanner().init();
});