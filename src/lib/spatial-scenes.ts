// SpatialVerse — the seeded spaces.
//
// Three places, written in the Spatial DOM by hand-and-loop, each chosen to
// exercise a different part of the engine:
//
//   the-virtual-library   ordinals (the second shelf, the third book from the
//                         left), "on" through a parent surface, "in" through
//                         rooms and furniture, drawers in a card catalogue
//   gallery-of-entrances  things hung on walls, ordinals along a wall that
//                         runs front to back, a sculpture that stands on a
//                         plinth it is not filed under — "on" from geometry
//   maker-studio          on a desk, in a drawer, above the desk, next to the
//                         monitor, left of the keyboard
//
// Pure data, no database. The engine derives every relation from the boxes
// below; nothing here says "on" or "second".

import { SDOM_VERSION, type SDocument, type SNode, type Vec3 } from './spatial-dom'

const n = (
  id: string,
  kind: SNode['kind'],
  type: string,
  name: string,
  pos: Vec3,
  size: Vec3,
  extra: Partial<SNode> = {},
): SNode => ({ id, kind, type, name, pos, size, ...extra })

/* ═════════════════════════════════════════════════════ the virtual library */

/** Public-domain books, so every title is a real one somebody might look for. */
const BOOKS: [string, string, string][] = [
  ['Moby-Dick', 'Herman Melville', 'whales, obsession, the sea'],
  ['Pride and Prejudice', 'Jane Austen', 'courtship, manners, family'],
  ['Frankenstein', 'Mary Shelley', 'creation, monsters, ambition'],
  ['The Time Machine', 'H. G. Wells', 'time travel, the far future'],
  ['Dracula', 'Bram Stoker', 'vampires, letters, horror'],
  ['Alice in Wonderland', 'Lewis Carroll', 'dreams, logic, nonsense'],
  ['The Odyssey', 'Homer', 'voyages, homecoming, gods'],
  ['Treasure Island', 'Robert Louis Stevenson', 'pirates, maps, treasure'],
  ['The War of the Worlds', 'H. G. Wells', 'martians, invasion'],
  ['Jane Eyre', 'Charlotte Brontë', 'governess, independence'],
  ['Wuthering Heights', 'Emily Brontë', 'moors, revenge, love'],
  ['Great Expectations', 'Charles Dickens', 'orphans, fortune, London'],
  ['A Christmas Carol', 'Charles Dickens', 'ghosts, redemption, winter'],
  ['The Art of War', 'Sun Tzu', 'strategy, tactics, conflict'],
  ['Meditations', 'Marcus Aurelius', 'stoicism, philosophy'],
  ['The Origin of Species', 'Charles Darwin', 'evolution, biology, nature'],
  ['Twenty Thousand Leagues Under the Seas', 'Jules Verne', 'submarines, the ocean'],
  ['Around the World in Eighty Days', 'Jules Verne', 'travel, wagers, trains'],
  ['The Picture of Dorian Gray', 'Oscar Wilde', 'portraits, vanity'],
  ['Little Women', 'Louisa May Alcott', 'sisters, growing up'],
  ['The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', 'detectives, mysteries'],
  ['Grimms Fairy Tales', 'Brothers Grimm', 'fairy tales, forests, witches'],
  ['The Republic', 'Plato', 'justice, philosophy, the state'],
  ['Leaves of Grass', 'Walt Whitman', 'poetry, America'],
  ['The Jungle Book', 'Rudyard Kipling', 'animals, jungles, India'],
  ['Peter Pan', 'J. M. Barrie', 'flight, pirates, childhood'],
  ['The Call of the Wild', 'Jack London', 'dogs, the Yukon, survival'],
  ['Don Quixote', 'Miguel de Cervantes', 'knights, windmills, madness'],
  ['The Prince', 'Niccolò Machiavelli', 'power, politics'],
  ['Walden', 'Henry David Thoreau', 'solitude, nature, cabins'],
  ['Flatland', 'Edwin A. Abbott', 'dimensions, geometry, shapes'],
  ['The Elements', 'Euclid', 'geometry, mathematics, proofs'],
  ['On the Revolutions', 'Nicolaus Copernicus', 'astronomy, the sun, planets'],
  ['The Wonderful Wizard of Oz', 'L. Frank Baum', 'wizards, tornadoes, Kansas'],
  ['Robinson Crusoe', 'Daniel Defoe', 'shipwrecks, islands, survival'],
  ['Gullivers Travels', 'Jonathan Swift', 'satire, giants, voyages'],
  ['The Strange Case of Dr Jekyll and Mr Hyde', 'Robert Louis Stevenson', 'duality, potions'],
  ['Heart of Darkness', 'Joseph Conrad', 'rivers, the Congo'],
  ['The Count of Monte Cristo', 'Alexandre Dumas', 'revenge, prisons, treasure'],
  ['A Tale of Two Cities', 'Charles Dickens', 'revolution, Paris, London'],
]

const COLOURS = ['red', 'blue', 'green', 'black', 'brown', 'gold', 'white', 'purple']

function bookcase(letter: string, x: number, bookStart: number): SNode {
  // 2.4 m wide, 2.2 m tall, five shelves. Shelf 1 is the top shelf, because
  // that is how the engine counts an unqualified "second shelf" and the
  // names should agree with it.
  const shelfY = [1.9, 1.45, 1.0, 0.55, 0.1]
  const shelves = shelfY.map((y, s) => {
    const books: SNode[] = []
    let bx = 0.06
    for (let b = 0; b < 8; b++) {
      const idx = (bookStart + s * 8 + b) % BOOKS.length
      const [title, author, topic] = BOOKS[idx]
      const w = 0.04 + ((idx * 7) % 4) * 0.008
      const h = 0.22 + ((idx * 3) % 4) * 0.02
      const colour = COLOURS[(idx + s) % COLOURS.length]
      books.push(
        n(`lib/rr/bc-${letter}/s${s + 1}/b${b + 1}`, 'object', 'book', title, [bx, 0.03, 0.08], [w, h, 0.18], {
          text: `${title} by ${author}. ${topic}. A ${colour} digital edition.`,
          tags: ['digital', 'ebook', colour],
          href: `/search?q=${encodeURIComponent(title)}`,
        }),
      )
      bx += w + 0.2
    }
    return n(`lib/rr/bc-${letter}/s${s + 1}`, 'surface', 'shelf', `Shelf ${s + 1}`, [0.05, y, 0.02], [2.3, 0.03, 0.36], {
      children: books,
    })
  })
  return n(`lib/rr/bc-${letter}`, 'furniture', 'bookcase', `Bookcase ${letter.toUpperCase()}`, [x, 0, 0.2], [2.4, 2.2, 0.4], {
    children: shelves,
  })
}

const LIBRARY: SDocument = {
  sdom: SDOM_VERSION,
  slug: 'the-virtual-library',
  title: 'The Virtual Library',
  summary: 'A reading room of three bookcases and a quiet archive. Every book is a digital edition you can open.',
  root: n('lib', 'space', 'library', 'The Virtual Library', [0, 0, 0], [22, 4, 10], {
    tags: ['virtual', 'digital', 'books'],
    children: [
      n('lib/rr', 'room', 'room', 'Reading Room', [0, 0, 0], [12, 4, 8], {
        children: [
          bookcase('a', 0.6, 0),
          bookcase('b', 3.8, 13),
          bookcase('c', 7.0, 27),
          n('lib/rr/table', 'furniture', 'table', 'Reading Table', [4.2, 0, 4.2], [2.2, 0.75, 1.1], {
            children: [
              n('lib/rr/table/top', 'surface', 'tabletop', 'Tabletop', [0, 0.72, 0], [2.2, 0.03, 1.1], {
                children: [
                  n('lib/rr/table/lamp', 'object', 'lamp', 'Green Reading Lamp', [0.15, 0.03, 0.4], [0.25, 0.45, 0.25], {
                    tags: ['green', 'brass'],
                  }),
                  n('lib/rr/table/open', 'object', 'book', 'Flatland (open)', [0.9, 0.03, 0.35], [0.4, 0.04, 0.3], {
                    text: 'Flatland by Edwin A. Abbott, lying open at chapter one. dimensions, geometry. A digital edition.',
                    tags: ['digital', 'open', 'white'],
                    href: '/search?q=Flatland',
                  }),
                ],
              }),
            ],
          }),
          n('lib/rr/chair', 'furniture', 'chair', 'Leather Armchair', [9.8, 0, 4.6], [0.9, 1.0, 0.9], { tags: ['leather', 'brown'] }),
          n('lib/rr/globe', 'object', 'globe', 'Celestial Globe', [10.9, 0, 3.0], [0.6, 1.2, 0.6], { tags: ['stars', 'brass'] }),
        ],
      }),
      n('lib/arc', 'room', 'room', 'Archive Room', [13, 0, 0], [9, 4, 8], {
        children: [
          n('lib/arc/cat', 'furniture', 'catalogue', 'Card Catalogue', [0.8, 0, 0.3], [1.6, 1.3, 0.6], {
            children: [1, 2, 3, 4].map((d) =>
              n(`lib/arc/cat/d${d}`, 'container', 'drawer', `Drawer ${d}`, [0.05, 1.3 - d * 0.3, 0.02], [1.5, 0.26, 0.56], {
                children: [
                  n(`lib/arc/cat/d${d}/card`, 'object', 'card', `Index cards ${['A–F', 'G–L', 'M–R', 'S–Z'][d - 1]}`, [0.1, 0.02, 0.05], [1.3, 0.12, 0.45], {
                    text: `Catalogue cards for authors ${['A to F', 'G to L', 'M to R', 'S to Z'][d - 1]}.`,
                  }),
                ],
              }),
            ),
          }),
          n('lib/arc/maps', 'furniture', 'cabinet', 'Map Cabinet', [4.0, 0, 0.3], [2.0, 1.0, 1.0], {
            children: [
              n('lib/arc/maps/top', 'surface', 'cabinet-top', 'Cabinet Top', [0, 0.97, 0], [2.0, 0.03, 1.0], {
                children: [
                  n('lib/arc/maps/scroll', 'object', 'scroll', 'Rolled Star Chart', [0.4, 0.03, 0.3], [0.9, 0.1, 0.1], {
                    text: 'A star chart of the northern sky.',
                    tags: ['stars', 'astronomy'],
                  }),
                ],
              }),
              n('lib/arc/maps/d1', 'container', 'drawer', 'Map Drawer 1', [0.05, 0.6, 0.05], [1.9, 0.3, 0.9], {
                children: [
                  n('lib/arc/maps/d1/map', 'object', 'map', 'Treasure Island Map', [0.2, 0.02, 0.1], [1.2, 0.02, 0.7], {
                    text: 'The map from Treasure Island, X marks the spot.',
                    tags: ['pirates', 'treasure'],
                  }),
                ],
              }),
              n('lib/arc/maps/d2', 'container', 'drawer', 'Map Drawer 2', [0.05, 0.2, 0.05], [1.9, 0.3, 0.9], {
                children: [
                  n('lib/arc/maps/d2/map', 'object', 'map', 'Map of Oz', [0.2, 0.02, 0.1], [1.2, 0.02, 0.7], {
                    text: 'A hand-drawn map of the Land of Oz.',
                    tags: ['oz', 'fantasy'],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  }),
}

/* ═══════════════════════════════════════════ the gallery of seven entrances */

const PAINTINGS: Record<'north' | 'east' | 'west', [string, string][]> = {
  north: [
    ['Discovery at Dawn', 'amber light over an open door'],
    ['The Asking Hour', 'a teal question mark in fog'],
    ['Social Weather', 'blue crowds under one umbrella'],
    ['Agents at Rest', 'violet machines asleep in a row'],
  ],
  east: [
    ['Red Reel', 'a film strip burning slowly'],
    ['Green Ledger', 'a market of small green coins'],
    ['Tabs Within Tabs', 'magenta windows nested forever'],
  ],
  west: [
    ['Portrait of a Character', 'a face made of speech bubbles'],
    ['The Seven Doors', 'seven doors in a ring, one open'],
    ['Still Life with Keyboard', 'a keyboard, a pear, a candle'],
  ],
}

function wall(side: 'north' | 'east' | 'west'): SNode {
  // North runs left to right along the back; east and west run front to back
  // along the sides, so their paintings count from the front.
  const pos: Vec3 = side === 'north' ? [0.5, 0, 0] : side === 'west' ? [0, 0, 0.5] : [13.85, 0, 0.5]
  const size: Vec3 = side === 'north' ? [13, 4, 0.15] : [0.15, 4, 9]
  const paintings = PAINTINGS[side].map(([title, caption], i) =>
    n(
      `gal/hall/${side}/p${i + 1}`,
      'object',
      'painting',
      title,
      side === 'north' ? [1 + i * 3.1, 1.3, 0.15] : [side === 'west' ? 0.15 : -0.05, 1.3, 1 + i * 2.8],
      side === 'north' ? [1.6, 1.2, 0.05] : [0.05, 1.2, 1.6],
      { text: `${title}: ${caption}.`, tags: ['oil', 'canvas'], href: '/art' },
    ),
  )
  return n(`gal/hall/${side}`, 'surface', 'wall', `${side[0].toUpperCase()}${side.slice(1)} Wall`, pos, size, { children: paintings })
}

const GALLERY: SDocument = {
  sdom: SDOM_VERSION,
  slug: 'gallery-of-entrances',
  title: 'Gallery of Seven Entrances',
  summary: 'One long hall of paintings, one for each Verse and a few strays, with a sculpture in the middle.',
  root: n('gal', 'space', 'gallery', 'Gallery of Seven Entrances', [0, 0, 0], [14, 4, 10], {
    tags: ['virtual', 'art'],
    children: [
      n('gal/hall', 'room', 'room', 'Main Hall', [0, 0, 0], [14, 4, 10], {
        children: [
          wall('north'),
          wall('east'),
          wall('west'),
          n('gal/hall/plinth', 'furniture', 'plinth', 'Marble Plinth', [6.4, 0, 4.4], [1.0, 1.1, 1.0], { tags: ['marble', 'white'] }),
          // Filed under the hall, not the plinth: it is "on the plinth" only
          // because its bottom meets the plinth's top. Geometry decides.
          n('gal/hall/sculpture', 'object', 'sculpture', 'The Listener', [6.6, 1.1, 4.6], [0.6, 0.9, 0.6], {
            text: 'The Listener, a bronze figure with one ear to the ground.',
            tags: ['bronze'],
          }),
          n('gal/hall/bench', 'furniture', 'bench', 'Viewing Bench', [5.5, 0, 2.0], [3.0, 0.45, 0.6], { tags: ['oak'] }),
        ],
      }),
    ],
  }),
}

/* ═════════════════════════════════════════════════════════ the maker studio */

const STUDIO: SDocument = {
  sdom: SDOM_VERSION,
  slug: 'maker-studio',
  title: 'Maker Studio',
  summary: 'A single desk, a drawer unit and a wall shelf. Small enough to know by heart.',
  root: n('std', 'space', 'studio', 'Maker Studio', [0, 0, 0], [6, 3, 5], {
    tags: ['virtual', 'workspace'],
    children: [
      n('std/room', 'room', 'room', 'Workroom', [0, 0, 0], [6, 3, 5], {
        children: [
          n('std/desk', 'furniture', 'desk', 'Standing Desk', [1.5, 0, 0.4], [1.8, 0.75, 0.8], {
            children: [
              n('std/desk/top', 'surface', 'desktop', 'Desktop', [0, 0.72, 0], [1.8, 0.03, 0.8], {
                children: [
                  n('std/desk/kbd', 'object', 'keyboard', 'Mechanical Keyboard', [0.6, 0.03, 0.45], [0.45, 0.04, 0.15], { tags: ['black'] }),
                  n('std/desk/mon', 'object', 'monitor', 'Wide Monitor', [0.5, 0.03, 0.1], [0.7, 0.45, 0.2], { tags: ['black'] }),
                  n('std/desk/mug', 'object', 'mug', 'Coffee Mug', [0.15, 0.03, 0.45], [0.09, 0.1, 0.09], { tags: ['white', 'coffee'] }),
                  n('std/desk/lamp', 'object', 'lamp', 'Desk Lamp', [1.4, 0.03, 0.15], [0.2, 0.5, 0.2], { tags: ['silver'] }),
                ],
              }),
            ],
          }),
          n('std/drawers', 'furniture', 'drawers', 'Drawer Unit', [3.5, 0, 0.4], [0.5, 0.7, 0.6], {
            children: [
              n('std/drawers/d1', 'container', 'drawer', 'Top Drawer', [0.02, 0.48, 0.02], [0.46, 0.2, 0.56], {
                children: [n('std/drawers/d1/usb', 'object', 'drive', 'USB Drive', [0.1, 0.02, 0.1], [0.06, 0.01, 0.02], { text: 'A USB drive labelled backups.', tags: ['backup'] })],
              }),
              n('std/drawers/d2', 'container', 'drawer', 'Middle Drawer', [0.02, 0.26, 0.02], [0.46, 0.2, 0.56], {
                children: [n('std/drawers/d2/note', 'object', 'notebook', 'Sketch Notebook', [0.1, 0.02, 0.1], [0.21, 0.02, 0.3], { text: 'A notebook of interface sketches.', tags: ['sketches'] })],
              }),
              n('std/drawers/d3', 'container', 'drawer', 'Bottom Drawer', [0.02, 0.04, 0.02], [0.46, 0.2, 0.56], {
                children: [n('std/drawers/d3/cable', 'object', 'cable', 'Tangle of Cables', [0.05, 0.02, 0.05], [0.3, 0.06, 0.3])],
              }),
            ],
          }),
          n('std/wallshelf', 'surface', 'shelf', 'Wall Shelf', [1.6, 1.6, 0.1], [1.6, 0.03, 0.3], {
            children: [
              n('std/wallshelf/plant', 'object', 'plant', 'Potted Fern', [0.2, 0.03, 0.05], [0.25, 0.35, 0.2], { tags: ['green'] }),
              n('std/wallshelf/clock', 'object', 'clock', 'Brass Clock', [1.1, 0.03, 0.05], [0.2, 0.2, 0.08], { tags: ['brass'] }),
            ],
          }),
        ],
      }),
    ],
  }),
}

export const SEED_SCENES: SDocument[] = [LIBRARY, GALLERY, STUDIO]

/** Example searches for the empty page, each exercising something different. */
export const SPATIAL_PROMPTS = [
  'the digital book located on the second shelf of the virtual library',
  'the third book from the left on the top shelf of bookcase b',
  'the sculpture on the plinth',
  'the second painting on the east wall',
  'the usb drive in the top drawer',
  'the plant above the desk',
]
