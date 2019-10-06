import { ActivatedRoute } from '@angular/router';

import { BookmarksService, BooksService } from '@bookapp/angular/data-access';
import { Book, BOOK_QUERY, BookmarkEvent } from '@bookapp/shared';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export abstract class ViewBookPageBase {
  book$: Observable<Book> = this.booksService
    .getBook(this.route.snapshot.paramMap.get('slug'))
    .valueChanges.pipe(map(({ data }) => data.book));

  bookmarks$: Observable<string[]> = this.bookmarksService
    .getBookmarks(this.route.snapshot.queryParamMap.get('bookId'))
    .valueChanges.pipe(
      map(({ data }) => data.userBookmarksByBook),
      map(bookmarks => bookmarks.map(bookmark => bookmark.type))
    );

  constructor(
    private readonly route: ActivatedRoute,
    private readonly booksService: BooksService,
    private readonly bookmarksService: BookmarksService
  ) {}

  submitComment(bookId: string, text: string, slug: string) {
    this.booksService.addComment(
      bookId,
      text,
      (store, { data: { addComment } }) => {
        const data: {
          book: Book;
        } = store.readQuery({
          query: BOOK_QUERY,
          variables: {
            slug
          }
        });

        data.book.comments.push(addComment);

        store.writeQuery({
          query: BOOK_QUERY,
          variables: {
            slug
          },
          data
        });
      }
    );
  }

  addToBookmarks(event: BookmarkEvent) {
    this.bookmarksService.addToBookmarks(event).subscribe();
  }

  removeFromBookmarks(event: BookmarkEvent) {
    this.bookmarksService.removeFromBookmarks(event).subscribe();
  }

  rate(event: { bookId: string; rate: number }, slug: string) {
    this.booksService
      .rateBook(event, (store, { data: { rateBook } }) => {
        const data: { book: Book } = store.readQuery({
          query: BOOK_QUERY,
          variables: {
            slug
          }
        });

        data.book.rating = rateBook.rating;
        data.book.total_rates = rateBook.total_rates;
        data.book.total_rating = rateBook.total_rating;

        store.writeQuery({
          query: BOOK_QUERY,
          variables: {
            slug
          },
          data
        });
      })
      .subscribe();
  }
}
