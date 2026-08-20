import type { Book, BookOrientation, BookPlatform, ColoringPage } from './books';

export interface PageOverrides {
  nightExcept?: BookOrientation[];
  chalkExcept?: BookOrientation[];
  darkVectorOverlayOrientations?: BookOrientation[];
}

type PageFactory = (id: string, name: string, overrides?: PageOverrides) => ColoringPage;
type BookFactory = (
  id: string,
  name: string,
  platforms: BookPlatform[],
  buildPages: (page: PageFactory) => ColoringPage[],
  darkVectorOverlayOrientations?: BookOrientation[]
) => Book;

export function createBookCatalog(book: BookFactory, bothOrientations: BookOrientation[]): Book[] {
  return [
    book(
      'farm',
      'Farm',
      ['web', 'mobile'],
      (page) => [
        page('cat', 'Cat'),
        page('cow', 'Cow'),
        page('dog', 'Dog'),
        page('duck', 'Duck'),
        page('horse', 'Horse'),
        page('pig', 'Pig'),
      ],
      bothOrientations
    ),
    book(
      'dinosaur',
      'Dinosaurs',
      ['web', 'mobile'],
      (page) => [
        page('brachiosaurus', 'Brachiosaurus'),
        page('pterodactyl', 'Pterodactyl'),
        page('stegosaurus', 'Stegosaurus'),
        page('trex', 'T. Rex'),
        page('triceratops', 'Triceratops'),
        page('velociraptor', 'Velociraptor'),
      ],
      bothOrientations
    ),
    book(
      'creatures',
      'Creatures',
      ['web', 'mobile'],
      (page) => [
        page('dragon', 'Dragon'),
        page('fairy', 'Fairy'),
        page('mermaid', 'Mermaid'),
        page('owl', 'Owl'),
        page('pegasus', 'Pegasus'),
        page('unicorn', 'Unicorn'),
      ],
      bothOrientations
    ),
    book(
      'nature',
      'Nature',
      ['web', 'mobile'],
      (page) => [
        page('ant', 'Ant'),
        page('bee', 'Bee'),
        page('caterpillar', 'Caterpillar'),
        page('ladybug', 'Ladybug'),
        page('snail', 'Snail'),
        page('spider', 'Spider'),
      ],
      bothOrientations
    ),
    book(
      'objects',
      'Objects',
      ['web', 'mobile'],
      (page) => [
        page('apple', 'Apple'),
        page('balloon', 'Balloon'),
        page('flower', 'Flower'),
        page('house', 'House'),
        page('teddy', 'Teddy'),
        page('umbrella', 'Umbrella'),
      ],
      bothOrientations
    ),
    book(
      'shapes',
      'Shapes',
      ['web', 'mobile'],
      (page) => [
        page('circle', 'Circle'),
        page('heart', 'Heart'),
        page('rectangle', 'Rectangle'),
        page('square', 'Square'),
        page('star', 'Star'),
        page('triangle', 'Triangle'),
      ],
      bothOrientations
    ),
    book('space', 'Space', ['web', 'mobile'], (page) => [
      page('astronaut', 'Astronaut', { darkVectorOverlayOrientations: bothOrientations }),
      page('meteor', 'Meteor', { darkVectorOverlayOrientations: bothOrientations }),
      page('moon', 'Moon', { darkVectorOverlayOrientations: bothOrientations }),
      page('rover', 'Rover', { darkVectorOverlayOrientations: bothOrientations }),
      page('ship', 'Ship', { darkVectorOverlayOrientations: bothOrientations }),
      page('station', 'Station', { darkVectorOverlayOrientations: ['portrait'] }),
    ]),
    book('vehicles', 'Vehicles', ['web', 'mobile'], (page) => [
      page('excavator', 'Excavator'),
      page('fire', 'Fire Truck'),
      page('garbage', 'Garbage Truck'),
      page('monster', 'Monster Truck'),
      page('police', 'Police Car'),
      page('train', 'Train'),
    ]),
  ];
}
