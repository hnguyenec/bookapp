import { AuthModule } from '@bookapp/api/auth';
import { CommentsModule, CommentsService } from '@bookapp/api/comments';
import { GraphqlModule } from '@bookapp/api/graphql';
import { ModelNames } from '@bookapp/api/shared';
import { UsersService } from '@bookapp/api/users';
import { comment, MockConfigService, mockConnection, MockModel, user } from '@bookapp/testing';

import { HttpStatus, INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';

import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';

const authToken = jwt.sign({ id: user._id }, 'ACCESS_TOKEN_SECRET');

const MockCommentsService = {
  saveForBook: jest.fn().mockResolvedValue(comment),
};

describe('CommentsModule', () => {
  let app: INestApplication;
  let commentsService: CommentsService;
  let usersService: UsersService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        AuthModule,
        GraphqlModule,
        CommentsModule,
        MongooseModule.forRoot('test'),
      ],
    })
      .overrideProvider(getConnectionToken())
      .useValue(mockConnection)
      .overrideProvider(getModelToken(ModelNames.COMMENT))
      .useValue(MockModel)
      .overrideProvider(getModelToken(ModelNames.USER))
      .useValue(MockModel)
      .overrideProvider(getModelToken(ModelNames.LOG))
      .useValue(MockModel)
      .overrideProvider(ConfigService)
      .useValue(MockConfigService)
      .overrideProvider(CommentsService)
      .useValue(MockCommentsService)
      .compile();

    commentsService = module.get<CommentsService>(CommentsService);
    usersService = module.get<UsersService>(UsersService);

    jest.spyOn(usersService, 'findById').mockResolvedValue(user as any);

    app = module.createNestApplication();
    await app.init();
  });

  describe('addComment()', () => {
    it('should add comment for book', async () => {
      return request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: `mutation {
            addComment(bookId: "book_id", text: "test comment") {
              _id
            }
          }`,
        })
        .expect({
          data: {
            addComment: {
              _id: comment._id,
            },
          },
        });
    });

    it('should return UNAUTHORIZED error', async () => {
      const res = await request(app.getHttpServer()).post('/graphql').send({
        query: `mutation {
            addComment(bookId: "book_id", text: "test comment") {
              _id
            }
          }`,
      });

      const [error] = res.body.errors;

      expect(error.extensions.exception.response).toEqual({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
