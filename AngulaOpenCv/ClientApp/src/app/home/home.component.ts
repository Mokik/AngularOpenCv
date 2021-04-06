import { Component, OnInit, ElementRef, Renderer2, ViewChild, Output, EventEmitter } from '@angular/core';
import { WebcamImage } from '../models/WebcamImage';

import { NgOpenCVService, OpenCVLoadResult } from 'ng-open-cv';
import { BehaviorSubject, forkJoin, Observable } from 'rxjs';
import { filter, switchMap, tap } from 'rxjs/operators';

declare var cv: any;

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
})

export class HomeComponent {
  openCVLoadResult: Observable<OpenCVLoadResult>;

  @ViewChild('video', { static: true }) videoElement: ElementRef;
  @ViewChild('canvas', { static: true }) canvas: ElementRef;
  @ViewChild('fileSelector') fileInput: ElementRef;

  @Output() public pictureTaken = new EventEmitter<WebcamImage>();
  @Output() public backCamera = new EventEmitter();

  private readonly debug = true;

  public readonly defaultImageType: string = "image/jpeg";
  public readonly fixImageBase64: string = "data:" + this.defaultImageType + ";base64,";
  public readonly fixPathLocalUrlFoto: string = "ImmaginiFoto/";

  private DEFAULT_VIDEO_OPTIONS: MediaTrackConstraints = { facingMode: 'environment', width: { min: 800 }, height: { min: 600 } };
  private DEFAULT_IMAGE_TYPE: string = this.defaultImageType;
  private DEFAULT_IMAGE_QUALITY: number = 0.92;

  private videoOptions: MediaTrackConstraints = this.DEFAULT_VIDEO_OPTIONS;
  private availableVideoInputs: MediaDeviceInfo[] = [];
  private mediaStream: MediaStream = null;
  private activeVideoSettings: MediaTrackSettings = null;
  private activeVideoInputIndex: number = -1;
  private videoInitialized: boolean = false;
  private imageLoadFile: any = null;
  private calledBackPlayVideo: boolean = false;
  private stopCameraClicked: boolean = false;

  imgDaUrlCam: any = null;

  public hdnLoadCamera: boolean = true;

  private classifiersLoaded = new BehaviorSubject<boolean>(false);
  classifiersLoaded$ = this.classifiersLoaded.asObservable();

  webcamImage: any = null;

  constructor(private renderer: Renderer2, private ngOpenCVService: NgOpenCVService) { }

  public ngOnInit(): void {
    const that = this;

    //const openCVConfig2: OpenCVOptions = {
    //  scriptUrl: 'assets/opencv/asm/3.4/opencv.js',
    //  wasmBinaryFile: 'wasm/3.4/opencv_js.wasm',
    //  usingWasm: true
    //};

    //this.ngOpenCVService.loadOpenCv(openCVConfig2);

    this.ngOpenCVService.isReady$
      .pipe(
        // The OpenCV library has been successfully loaded if result.ready === true
        filter((result: OpenCVLoadResult) => result.ready),
        switchMap(() => {
          // Load the face and eye classifiers files
          return this.loadClassifiers();
        })
      )
      .subscribe(() => {
        // The classifiers have been succesfully loaded
        this.classifiersLoaded.next(true);
      });

    this.openCVLoadResult = this.ngOpenCVService.isReady$;
    this.openCVLoadResult.subscribe({
      next() {
        that.startCamera();

      },
      error(msg) {
        console.log('Error openCVLoadResult: ', msg);

      }
    });
  }

  // Before attempting face detection, we need to load the appropriate classifiers in memory first
  // by using the createFileFromUrl(path, url) function, which takes two parameters
  // @path: The path you will later use in the detectMultiScale function call
  // @url: The url where to retrieve the file from.
  loadClassifiers(): Observable<any> {
    return forkJoin(
      this.ngOpenCVService.createFileFromUrl(
        'haarcascade_frontalface_default.xml',
        `assets/opencv/data/haarcascades/haarcascade_frontalface_default.xml`
      ),
      this.ngOpenCVService.createFileFromUrl(
        'haarcascade_eye.xml',
        `assets/opencv/data/haarcascades/haarcascade_eye.xml`
      )
    );
  }

  startCamera(): void {
    const that = this;
    this.stopCameraClicked = false;

    if (this.hasGetUserMedia()) {
      const deviceId = null;
      const userVideoTrackConstraints = this.videoOptions;
      const videoTrackConstraints = this.getMediaConstraintsForDevice(deviceId, userVideoTrackConstraints);
      //const that = this;

      navigator.mediaDevices.getUserMedia(<MediaStreamConstraints>{ video: videoTrackConstraints })
        .then((stream: MediaStream) => {
          this.mediaStream = stream;
          this.videoElement.nativeElement.srcObject = stream;
          this.videoElement.nativeElement.play();

          this.videoElement.nativeElement.onplay = function () { if (!that.calledBackPlayVideo) { that.callBackPlayVideo(); that.calledBackPlayVideo = true; } };

          //this.ngOpenCVService.video = this.videoElement.nativeElement;
          //this.ngOpenCVService.stream = stream;

          this.activeVideoSettings = stream.getVideoTracks()[0].getSettings();

          const activeDeviceId: string = this.getDeviceIdFromMediaStreamTrack(stream.getVideoTracks()[0]);
          this.detectAvailableDevices()
            .then(() => {
              this.activeVideoInputIndex = activeDeviceId ? this.availableVideoInputs.findIndex((mediaDeviceInfo: MediaDeviceInfo) => mediaDeviceInfo.deviceId === activeDeviceId) : -1;
              this.videoInitialized = true;

            })
            .catch(() => {
              this.activeVideoInputIndex = -1;
              this.videoInitialized = true;

            });

          //this.videoElement.nativeElement.addEventListener("canplay", function (ev) { that.triggerSnapshot(); }, false);

        })
        .catch((err: MediaStreamError) => { this.handleError(err); });

    } else {
      this.hdnLoadCamera = false;
      this.handleError('Sorry, camera not available.');

    }
  }

  private callBackPlayVideo() {
    const that = this;
    if (this.stopCameraClicked) { return; }

    setTimeout(function () {
      that.triggerSnapshot();

      //that.callBackPlayVideo();
    }, 1000);
  }

  private hasGetUserMedia() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  public ngOnDestroy(): void { this.stopCamera(); }

  stopCamera(): void {
    this.stopCameraClicked = true;
    (<MediaStream>this.videoElement.nativeElement.srcObject).getTracks().forEach(stream => stream.stop());
  }

  private getMediaConstraintsForDevice(deviceId: string, baseMediaTrackConstraints: MediaTrackConstraints): MediaTrackConstraints {
    const result: MediaTrackConstraints = baseMediaTrackConstraints ? baseMediaTrackConstraints : this.DEFAULT_VIDEO_OPTIONS;
    if (deviceId) { result.deviceId = { exact: deviceId }; }

    return result;
  }

  private getValueFromConstrainDOMString(constrainDOMString: ConstrainDOMString): string {
    if (constrainDOMString) {
      if (constrainDOMString instanceof String) {
        return String(constrainDOMString);
      } else if (Array.isArray(constrainDOMString) && Array(constrainDOMString).length > 0) {
        return String(constrainDOMString[0]);
      } else if (typeof constrainDOMString === 'object') {
        if (constrainDOMString['exact']) {
          return String(constrainDOMString['exact']);
        } else if (constrainDOMString['ideal']) {
          return String(constrainDOMString['ideal']);
        }
      }
    }

    return null;
  }

  private getDeviceIdFromMediaStreamTrack(mediaStreamTrack: MediaStreamTrack): string {
    if (mediaStreamTrack.getSettings && mediaStreamTrack.getSettings() && mediaStreamTrack.getSettings().deviceId) {
      return mediaStreamTrack.getSettings().deviceId;
    } else if (mediaStreamTrack.getConstraints && mediaStreamTrack.getConstraints() && mediaStreamTrack.getConstraints().deviceId) {
      const deviceIdObj: ConstrainDOMString = mediaStreamTrack.getConstraints().deviceId;
      return this.getValueFromConstrainDOMString(deviceIdObj);
    }
  }

  public getAvailableVideoInputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) { return Promise.reject('enumerateDevices() not supported.'); }

    return new Promise((resolve, reject) => {
      navigator.mediaDevices.enumerateDevices()
        .then((devices: MediaDeviceInfo[]) => { resolve(devices.filter((device: MediaDeviceInfo) => device.kind === 'videoinput')); })
        .catch(err => { reject(err.message || err); });
    });
  }

  private detectAvailableDevices(): Promise<MediaDeviceInfo[]> {
    return new Promise((resolve, reject) => {
      this.getAvailableVideoInputs()
        .then((devices: MediaDeviceInfo[]) => { this.availableVideoInputs = devices; resolve(devices); })
        .catch(err => { this.availableVideoInputs = []; reject(err); });
    });
  }

  loadFile(): void { this.fileInput.nativeElement.click(); }

  onFileChange(event: Event) {
    if ((event.target as HTMLInputElement).files && (event.target as HTMLInputElement).files.length) {
      const files = (<HTMLInputElement>event.target).files;
      if (files.length === 0) { return; }

      const fl = files[0];
      const mimeType = fl.type;
      if (mimeType.match(/image\/*/) == null) { console.error("Only images are supported."); return; }

      //let image = new Image();
      //image.onload = () => this.drawImageScaled(image);
      //image.src = URL.createObjectURL(fl);
      //this.doOCR(image);
      const that = this;
      const ctx = this.canvas.nativeElement.getContext('2d');
      //this.renderer.setProperty(this.canvas.nativeElement, 'width', 200);
      //this.renderer.setProperty(this.canvas.nativeElement, 'height', 200);

      const reader = new FileReader();
      reader.readAsDataURL(fl);
      reader.onload = (_event) => {
        that.imgDaUrlCam = reader.result;
        //const img = that.imageLoadFile;

        //this.renderer.setProperty(this.canvas.nativeElement, 'width', 200);
        //this.renderer.setProperty(this.canvas.nativeElement, 'height', 200);
        //this.canvas.nativeElement.getContext('2d').drawImage(imgDaUrlCam, 0, 0, 200, 200);
      }

      let image = new Image();
      image.src = URL.createObjectURL(fl);
      image.onload = function () {
        that.renderer.setProperty(that.canvas.nativeElement, 'width', image.width);
        that.renderer.setProperty(that.canvas.nativeElement, 'height', image.height);
        ctx.drawImage(image, 0, 0);

        that.stopCamera();
        that.imageLoadFile = image;

        that.elabEdgeImage();
      }
    }
  }

  triggerSnapshot(): void { this.canvasImage(); this.runOpenCv(); }

  private runOpenCv() {
    this.ngOpenCVService.isReady$
      .pipe(
        filter((result: OpenCVLoadResult) => result.ready),
        switchMap(() => {
          return this.classifiersLoaded$;

        }),
        tap(() => {
          //this.clearOutputCanvas();
          //this.elabFaceEyeImage();
          this.elabEdgeImage();

          this.callBackPlayVideo();
        }))
      .subscribe(() => {
        //console.log('elabImage end');
      });
  }

  clearOutputCanvas() {
    const context = this.canvas.nativeElement.getContext('2d');
    context.clearRect(0, 0, this.canvas.nativeElement.width, this.canvas.nativeElement.height);
  }

  elabEdgeImage(): void {
    const src = cv.imread(this.canvas.nativeElement.id);
    const src2 = src.clone();

    let dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
    cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
    cv.threshold(src, src, 100, 200, cv.THRESH_BINARY);

    let contours = new cv.MatVector();
    let contours2 = new cv.MatVector();

    let hierarchy = new cv.Mat();
    let hull = new cv.MatVector();
    let poly = new cv.MatVector();
    cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    // approximates each contour to convex hull
    for (let i = 0; i < contours.size(); ++i) {
      let cnt = contours.get(i);

      let area = cv.contourArea(cnt, false);
      let perimeter = cv.arcLength(cnt, true);
      if ((area > 50) && (perimeter > 50)) {
        let rect = cv.boundingRect(cnt);
        let aspectRatio = rect.width / rect.height;

        const area2 = rect.width * rect.height;
        const diffArea = area2 - area;

        let tmp2 = new cv.Mat();
        cv.approxPolyDP(cnt, tmp2, 100, true);
        const size = tmp2.size();
        let vertices = 0;
        if (size != null) { vertices = size.height; }

        //if ((true) || ((aspectRatio >= 2) && (aspectRatio <= 4))) {
        //if (diffArea <= 6000) {
        if ((vertices >= 4) && (vertices <= 5)) {
          contours2.push_back(cnt);

          let tmp = new cv.Mat();
          cv.convexHull(cnt, tmp, false, true);

          hull.push_back(tmp);
          poly.push_back(tmp2);

          tmp.delete();
        }

        cnt.delete();
        tmp2.delete();
      }
    }

    // draw contours with random Scalar
    for (let i = 0; i < contours2.size(); ++i) {
      //let colorHull = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255), Math.round(Math.random() * 255));
      let colorHull = new cv.Scalar(255, 0, 122);
      //cv.drawContours(src2, hull, i, colorHull, 2, 8, hierarchy, 0);

      //colorHull = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255), Math.round(Math.random() * 255));
      //colorHull = new cv.Scalar(122, 0, 255);
      cv.drawContours(src2, poly, i, colorHull, 3, 8, hierarchy, 0);
    }

    cv.imshow(this.canvas.nativeElement.id, src2);
    src.delete();
    src2.delete();
    dst.delete();
    hierarchy.delete();
    contours.delete();
    contours2.delete();
    hull.delete();

    // 1.
    //let gray_image = new cv.Mat();
    //cv.cvtColor(src, gray_image, cv.COLOR_RGBA2GRAY)

    //let gray_image_blured = new cv.Mat();
    //let ksize = new cv.Size(3, 3);
    //let anchor = new cv.Point(-1, -1);
    //cv.blur(gray_image, gray_image_blured, ksize, anchor, cv.BORDER_DEFAULT);
    //cv.imshow('grayBluredOpenCv', gray_image_blured);

    //let edged_image = new cv.Mat();
    //cv.Canny(src, edged_image, 50, 100, 3, false);
    //cv.imshow('edgeOpenCv', edged_image);

    // 2.
    //let contours_image = cv.Mat.zeros(src.cols, src.rows, cv.CV_8UC3);
    //cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
    //cv.threshold(src, src, 120, 200, cv.THRESH_BINARY);
    //let contours = new cv.MatVector();
    //let hierarchy = new cv.Mat();

    //cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    //for (let i = 0; i < contours.size(); ++i) {
    //  let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255), Math.round(Math.random() * 255));
    //  cv.drawContours(contours_image, contours, i, color, 1, cv.LINE_8, hierarchy, 100);
    //}

    // 3.
    //let cnt = contours.get(0);
    //let perimeter = cv.arcLength(cnt, true);
    //cv.approxPolyDP(contours[0], 0.02 * perimeter, 3, true);

    // esempio https://docs.opencv.org/3.4/dc/dcf/tutorial_js_contour_features.html
    //let dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
    //let dst2 = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
    //cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY, 0);
    //cv.threshold(dst, dst2, 100, 200, cv.THRESH_BINARY);

    //let contours = new cv.MatVector();
    //let hierarchy = new cv.Mat();
    //let poly = new cv.MatVector();
    //cv.findContours(dst2, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    // approximates each contour to polygon
    /*for (let i = 0; i < contours.size(); ++i) {
      let tmp = new cv.Mat();
      let cnt = contours.get(i);

      cv.approxPolyDP(cnt, tmp, 3, true);
      poly.push_back(tmp);
      cnt.delete(); tmp.delete();
    }*/

    // draw contours with random Scalar
    //for (let i = 0; i < contours.size(); ++i) {
    //  let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255), Math.round(Math.random() * 255));
    //  cv.drawContours(dst, poly, i, color, 1, 8, hierarchy, 0);
    //}

    //let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255), Math.round(Math.random() * 255));
    //cv.drawContours(src, poly, -1, color, 1, 8, hierarchy, 100);

    //let color = new cv.Scalar(124, 255, 10);
    //cv.drawContours(src, contours, -1, color);

    //cv.imshow(this.canvas.nativeElement.id, gray_image);
    //src.delete();
    //gray_image.delete();
    //gray_image_blured.delete();
    //edged_image.delete();

    //contours_image.delete();
    //contours.delete();
    //hierarchy.delete();


  }

  elabFaceEyeImage(): void {
    const src = cv.imread(this.canvas.nativeElement.id);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    const faces = new cv.RectVector();
    const eyes = new cv.RectVector();
    const faceCascade = new cv.CascadeClassifier();
    const eyeCascade = new cv.CascadeClassifier();

    // load pre-trained classifiers, they should be in memory now
    faceCascade.load('haarcascade_frontalface_default.xml');
    eyeCascade.load('haarcascade_eye.xml');

    // detect faces
    const msize = new cv.Size(0, 0);
    faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0, msize, msize);

    for (let i = 0; i < faces.size(); ++i) {
      const roiGray = gray.roi(faces.get(i));
      const roiSrc = src.roi(faces.get(i));
      const point1 = new cv.Point(faces.get(i).x, faces.get(i).y);
      const point2 = new cv.Point(faces.get(i).x + faces.get(i).width, faces.get(i).y + faces.get(i).height);
      cv.rectangle(src, point1, point2, [255, 0, 0, 255]);

      // detect eyes in face ROI
      eyeCascade.detectMultiScale(roiGray, eyes);
      for (let j = 0; j < eyes.size(); ++j) {
        const point3 = new cv.Point(eyes.get(j).x, eyes.get(j).y);
        const point4 = new cv.Point(eyes.get(j).x + eyes.get(j).width, eyes.get(j).y + eyes.get(j).height);
        cv.rectangle(roiSrc, point3, point4, [0, 0, 255, 255]);
      }

      roiGray.delete();
      roiSrc.delete();
    }
    cv.imshow(this.canvas.nativeElement.id, src);

    src.delete();
    gray.delete();
    faceCascade.delete();
    eyeCascade.delete();
    faces.delete();
    eyes.delete();
  }

  canvasImage(): void {
    this.webcamImage = new WebcamImage();
    this.webcamImage.codice = new Date().toISOString();
    this.webcamImage.width = this.videoElement.nativeElement.videoWidth;
    this.webcamImage.height = this.videoElement.nativeElement.videoHeight;

    this.renderer.setProperty(this.canvas.nativeElement, 'width', this.webcamImage.width);
    this.renderer.setProperty(this.canvas.nativeElement, 'height', this.webcamImage.height);
    this.canvas.nativeElement.getContext('2d').drawImage(this.videoElement.nativeElement, 0, 0);

    const mimeType: string = this.DEFAULT_IMAGE_TYPE;
    const quality: number = this.DEFAULT_IMAGE_QUALITY;

    this.webcamImage.imageAsDataUrl = this.canvas.nativeElement.toDataURL(mimeType, quality);
    this.webcamImage.imageBase64 = this.webcamImage.imageAsDataUrl.replace(/^data:image\/(png|jpg);base64,/, "");

    //if (this.debug) { console.info('received webcam image', this.webcamImage); }

    this.pictureTaken.emit(this.webcamImage);
  }

  public triggerBackCamera(): void { this.backCamera.emit(); }

  handleError(error: any): void { console.error("camera handleError " + error); }

}
