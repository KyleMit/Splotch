export const PAGE_IDS = ['blank', 'sunshine', 'flower', 'turtle'] as const;
export type PageId = (typeof PAGE_IDS)[number];

export const COLORING_PAGES = {
  blank: { label: 'Blank paper', paths: [] },
  sunshine: {
    label: 'Sunshine',
    paths: [
      'M 682 384 A 170 170 0 1 1 342 384 A 170 170 0 1 1 682 384 Z',
      'M 512 118 L 512 170 M 512 598 L 512 650 M 246 384 L 298 384 M 726 384 L 778 384',
      'M 324 196 L 362 234 M 662 534 L 700 572 M 324 572 L 362 534 M 662 234 L 700 196',
      'M 441 340 L 441 364 M 583 340 L 583 364 M 436 428 Q 512 510 588 428',
    ],
  },
  flower: {
    label: 'Garden flower',
    paths: [
      'M 442 236 C 400 156 437 118 512 138 C 587 118 624 156 582 236 C 662 194 706 226 688 284 C 706 342 662 374 582 332 C 624 412 587 450 512 430 C 437 450 400 412 442 332 C 362 374 318 342 336 284 C 318 226 362 194 442 236 Z',
      'M 569 284 A 57 57 0 1 1 455 284 A 57 57 0 1 1 569 284 Z',
      'M 512 430 L 512 656 M 512 552 C 428 553 378 507 368 452 C 448 445 504 480 512 552 Z',
      'M 512 602 C 596 603 646 557 656 502 C 576 495 520 530 512 602 Z',
    ],
  },
  turtle: {
    label: 'Little turtle',
    paths: [
      'M 330 446 C 261 424 225 463 247 500 C 269 525 309 509 343 486',
      'M 590 483 C 567 560 622 588 653 553 C 673 527 652 499 635 477',
      'M 415 483 C 392 560 447 588 478 553 C 498 527 477 499 460 477',
      'M 693 375 C 757 274 861 323 842 393 C 834 437 780 455 713 446',
      'M 314 455 C 306 277 410 226 513 226 C 625 226 727 310 722 455 Q 524 539 314 455 Z',
      'M 448 244 L 422 360 L 348 424 M 583 242 L 609 360 L 690 422',
      'M 422 360 L 609 360 M 422 360 L 453 494 M 609 360 L 578 494',
      'M 794 355 L 794 367 M 797 407 Q 779 418 764 404',
    ],
  },
} as const satisfies Record<PageId, { label: string; paths: readonly string[] }>;

export function isPageId(value: unknown): value is PageId {
  return PAGE_IDS.some((id) => id === value);
}
