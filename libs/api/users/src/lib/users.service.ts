import { ConfigService } from '@bookapp/api/config';
import { ApiQuery } from '@bookapp/api/shared';
import { ApiResponse } from '@bookapp/shared/models';

import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { randomBytes } from 'crypto';
import { extend } from 'lodash';
import { Model } from 'mongoose';
import { promisify } from 'util';

import { USER_VALIDATION_ERRORS } from './constants';
import { UserDto } from './dto/user';
import { UserModel } from './interfaces/user';

const randomBytesAsync = promisify(randomBytes);
const EXCLUDED_FIELDS = '-salt -password';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<UserModel>,
    private readonly configService: ConfigService
  ) {}

  async findAll(query?: ApiQuery): Promise<ApiResponse<UserModel>> {
    const { filter, skip, first, order } = query;
    const where = filter || {};
    const count = await this.userModel.countDocuments(where).exec();
    const rows = await this.userModel
      .find(where, EXCLUDED_FIELDS)
      .skip(skip || 0)
      .limit(first || parseInt(this.configService.get('DEFAULT_LIMIT'), 10))
      .sort(order)
      .exec();

    return {
      count,
      rows
    };
  }

  findById(id: string): Promise<UserModel> {
    return this.userModel.findById(id, EXCLUDED_FIELDS).exec();
  }

  findByIds(ids: string[]): Promise<UserModel[]> {
    return this.userModel.find({ _id: { $in: ids } }, EXCLUDED_FIELDS).exec();
  }

  findByEmail(email: string): Promise<UserModel> {
    return this.userModel.findOne({ email }).exec();
  }

  create(user: UserDto): Promise<UserModel> {
    const newUser = new this.userModel(user);
    newUser.displayName = `${newUser.firstName} ${newUser.lastName}`;
    return newUser.save();
  }

  async update(id: string, updatedUser: UserDto): Promise<UserModel> {
    const user = await this.userModel.findById(id, EXCLUDED_FIELDS).exec();

    // remove old avatar from bucket first if new one is adding
    if (
      updatedUser.avatar &&
      user.avatar &&
      user.avatar !== updatedUser.avatar
    ) {
      try {
        const splitted = user.avatar.split('/'); // take last part of uri as a key
        // tslint:disable-next-line: no-commented-code
        // await this.fileService.deleteFromBucket(splitted[splitted.length - 1]);
      } catch (err) {
        throw new BadRequestException(err);
      }
    }

    extend(user, updatedUser);
    user.displayName = `${user.firstName} ${user.lastName}`;
    return user.save();
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string
  ): Promise<UserModel> {
    const user = await this.userModel.findById(id).exec();

    if (user.authenticate(oldPassword)) {
      user.password = newPassword;
      return user.save();
    } else {
      throw new BadRequestException(
        USER_VALIDATION_ERRORS.OLD_PASSWORD_MATCH_ERR
      );
    }
  }

  async requestResetPassword(email: string): Promise<string> {
    let token;

    const user = await this.userModel
      .findOne({ email }, EXCLUDED_FIELDS)
      .exec();

    if (!user) {
      throw new NotFoundException(USER_VALIDATION_ERRORS.EMAIL_NOT_FOUND_ERR);
    }

    const buffer = await randomBytesAsync(20);

    token = buffer.toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires =
      Date.now() +
      parseInt(this.configService.get('REQUEST_TOKEN_EXPIRATION_TIME'), 10);

    await user.save();

    return token;
  }

  async resetPassword(token: string, password: string): Promise<UserModel> {
    const user = await this.userModel
      .findOne({
        resetPasswordToken: token,
        resetPasswordExpires: {
          $gt: Date.now()
        }
      })
      .exec();

    if (!user) {
      throw new NotFoundException(USER_VALIDATION_ERRORS.TOKEN_NOT_FOUND_ERR);
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    return user.save();
  }

  async remove(id: string): Promise<UserModel> {
    const user = await this.userModel.findById(id, EXCLUDED_FIELDS).exec();
    await user.remove();
    return user;
  }
}
