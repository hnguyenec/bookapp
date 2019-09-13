import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { NsBaseForm } from '@bookapp/angular/base';
import {
  FeedbackPlatformService,
  UploadPlatformService
} from '@bookapp/angular/core';
import { User } from '@bookapp/shared/models';

import { requestPermissions, takePicture } from 'nativescript-camera';
import { ImageCropper } from 'nativescript-imagecropper';
import { RadSideDrawer } from 'nativescript-ui-sidedrawer';

import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import * as app from 'tns-core-modules/application';
import { knownFolders, path } from 'tns-core-modules/file-system';
import { ImageSource } from 'tns-core-modules/image-source';
import { isAndroid, isIOS } from 'tns-core-modules/platform';
import { getViewById } from 'tns-core-modules/ui/page/page';

@Component({
  selector: 'bookapp-profile-form',
  templateUrl: './profile-form.component.html',
  styleUrls: ['./profile-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileFormComponent extends NsBaseForm {
  progress$ = this.uploadService.progress$;

  @Input() loading: boolean;

  @Input()
  set user(user: Partial<User>) {
    if (user) {
      this._user = user;
      this.source.next({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      });
    }
  }
  get user(): Partial<User> {
    return this._user;
  }

  @Input()
  set error(error: any) {
    if (error) {
      this.handleError(error);
    }
  }

  @Output() formSubmitted = new EventEmitter<any>();

  private imageSource = new ImageSource();
  private imageCropper = new ImageCropper();
  private _user: Partial<User>;
  private source = new BehaviorSubject<Partial<User>>({
    firstName: '',
    lastName: '',
    email: ''
  });
  private uploading = new BehaviorSubject<boolean>(false);

  constructor(
    feedbackService: FeedbackPlatformService,
    private readonly uploadService: UploadPlatformService
  ) {
    super(feedbackService);
  }

  get source$(): Observable<Partial<User>> {
    return this.source.asObservable();
  }

  get uploading$(): Observable<boolean> {
    return this.uploading.asObservable();
  }

  async submit() {
    const valid = await this.dataForm.dataForm.validateAll();

    if (valid) {
      this.formSubmitted.emit(this.source);
    }
  }

  async changeAvatar() {
    try {
      await requestPermissions();
    } catch (err) {
      this.feedbackService.error('Permissions rejected');
      return;
    }

    const imageAsset: any = await takePicture({
      width: 300,
      height: 300,
      keepAspectRatio: true
    });

    const imageSource = await this.imageSource.fromAsset(imageAsset);

    const cropped = await this.imageCropper.show(imageSource, {
      width: 300,
      height: 300,
      lockSquare: true
    });

    if (!cropped.image) {
      return;
    }

    let localPath = null;

    if (isAndroid) {
      localPath = cropped.image.android;
    }

    if (isIOS) {
      const folder = knownFolders.documents();
      const filePath = path.join(
        folder.path,
        `avatar_for_ba_${new Date().getTime()}.png`
      );
      cropped.image.saveToFile(filePath, 'png');

      localPath = filePath;
    }

    if (localPath) {
      this.uploading.next(true);
      this.uploadService
        .upload(localPath)
        .pipe(map(res => JSON.parse(res)))
        .subscribe(
          ({ publicUrl }) => {
            this.uploading.next(false);
            this.formSubmitted.emit({
              id: this.user._id,
              user: { avatar: publicUrl }
            });
          },
          ({ message }) => {
            this.uploading.next(false);
            this.handleError({ message: { message } });
          }
        );
    }
  }

  onDrawerButtonTap() {
    const sideDrawer = getViewById(
      app.getRootView(),
      'drawer'
    ) as RadSideDrawer;
    sideDrawer.toggleDrawerState();
  }
}