import { ConfigService } from '@bookapp/api/config';
import { FilesService } from '@bookapp/api/files';
import { LogDto, LogsService } from '@bookapp/api/logs';
import { ApiQuery } from '@bookapp/api/shared';
import { ApiResponse, UserActions } from '@bookapp/shared/models';

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { extend } from 'lodash';
import { Model } from 'mongoose';

import { BOOK_MODEL_NAME } from './constants';
import { BookDto } from './dto/book';
import { BookModel } from './interfaces/book';

@Injectable()
export class BooksService {
  constructor(
    @InjectModel(BOOK_MODEL_NAME) private readonly bookModel: Model<BookModel>,
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
    private readonly logsService: LogsService
  ) {}

  async findAll(query?: ApiQuery): Promise<ApiResponse<BookModel>> {
    const { filter, skip, first, order } = query;
    const where = filter || {};
    const count = await this.bookModel.countDocuments(where).exec();
    const rows = await this.bookModel
      .find(where)
      .skip(skip || 0)
      .limit(first || parseInt(this.configService.get('DEFAULT_LIMIT'), 10))
      .sort(order)
      .exec();

    return {
      count,
      rows
    };
  }

  findBySlug(slug: string): Promise<BookModel> {
    return this.bookModel
      .findOneAndUpdate({ slug }, { $inc: { views: 1 } })
      .exec();
  }

  findById(id: string): Promise<BookModel> {
    return this.bookModel.findById(id).exec();
  }

  findByIds(ids: string[]): Promise<BookModel[]> {
    return this.bookModel.find({ _id: { $in: ids } }).exec();
  }

  async findBestBooks(query?: ApiQuery): Promise<ApiResponse<BookModel>> {
    const { skip, first } = query;
    const where = { rating: 5 };
    const count = await this.bookModel.countDocuments(where).exec();
    const rows = await this.bookModel
      .find(where)
      .skip(skip || 0)
      .limit(first || parseInt(this.configService.get('DEFAULT_LIMIT'), 10))
      .exec();

    return {
      count,
      rows
    };
  }

  async create(book: BookDto, userId: string): Promise<BookModel> {
    const newBook = new this.bookModel(book);

    await newBook.save();
    await this.logsService.create(
      new LogDto(userId, UserActions.BOOK_CREATED, newBook._id)
    );

    return newBook;
  }

  async update(
    id: string,
    updatedBook: BookDto,
    userId: string
  ): Promise<BookModel> {
    const book = await this.bookModel.findById(id).exec();
    const filePromises = [];
    // remove old files from bucket first if new ones are adding
    if (
      book.coverUrl &&
      updatedBook.coverUrl &&
      book.coverUrl !== updatedBook.coverUrl
    ) {
      const splitted = book.coverUrl.split('/'); // take last part of uri as a key
      filePromises.push(
        this.filesService.deleteFromBucket(splitted[splitted.length - 1])
      );
    }

    if (
      book.epubUrl &&
      updatedBook.epubUrl &&
      book.epubUrl !== updatedBook.epubUrl
    ) {
      const splitted = book.epubUrl.split('/'); // take last part of uri as a key
      filePromises.push(
        this.filesService.deleteFromBucket(splitted[splitted.length - 1])
      );
    }

    if (filePromises.length) {
      try {
        await Promise.all(filePromises);
      } catch (err) {
        throw new BadRequestException(err);
      }
    }

    extend(book, updatedBook);

    await book.save();
    await this.logsService.create(
      new LogDto(userId, UserActions.BOOK_UPDATED, book._id)
    );

    return book;
  }

  async rateBook(
    id: string,
    newRate: number,
    userId: string
  ): Promise<BookModel> {
    const book = await this.bookModel.findById(id).exec();
    const total_rates = book.total_rates + 1;
    const total_rating = book.total_rating + newRate;
    const rating = Math.ceil(total_rating / total_rates);

    book.total_rates = total_rates;
    book.total_rating = total_rating;
    book.rating = rating;

    await book.save();
    await this.logsService.create(
      new LogDto(userId, UserActions.BOOK_RATED, book._id)
    );

    return book;
  }
}