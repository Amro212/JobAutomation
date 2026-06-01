import './wind-background.css';

/**
 * SVG wind wisps animated via stroke-dasharray / stroke-dashoffset
 * (same technique as https://codepen.io/antoniandre/pen/QZVXjq).
 *
 * Path lengths are precomputed (SVGPathElement.getTotalLength) so mount
 * does not need layout reads or a post-paint useEffect.
 */
const WIND_PATHS = [
  {
    id: 'wind-1',
    className: 'wind-background__path--1',
    d: 'M-40 180 C 80 170, 140 190, 260 175 S 420 160, 520 178',
    length: 561.86
  },
  {
    id: 'wind-2',
    className: 'wind-background__path--2',
    d: 'M-20 320 C 120 300, 200 340, 340 310 S 500 290, 640 318',
    length: 665.14
  },
  {
    id: 'wind-3',
    className: 'wind-background__path--3',
    d: 'M60 90 C 180 110, 240 70, 360 95 S 480 120, 580 88',
    length: 526.2
  },
  {
    id: 'wind-4',
    className: 'wind-background__path--4',
    d: 'M120 420 C 220 400, 300 440, 400 415 S 520 395, 620 425',
    length: 506.17
  },
  {
    id: 'wind-5',
    className: 'wind-background__path--5',
    d: 'M200 250 C 280 230, 340 270, 420 248 S 500 225, 560 255',
    length: 368.15
  },
  {
    id: 'wind-6',
    className: 'wind-background__path--6',
    d: 'M-60 260 C 40 240, 100 280, 200 255 C 300 230, 380 275, 480 250 S 600 220, 700 265',
    length: 770.96
  }
] as const;

export function WindBackground() {
  return (
    <div
      className="wind-background"
      data-testid="wind-background"
      aria-hidden="true"
      style={{ '--wind-stroke': '#dbc1b5' } as React.CSSProperties}
    >
      <svg
        className="wind-background__svg"
        viewBox="0 0 640 480"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {WIND_PATHS.map((path) => (
          <path
            key={path.id}
            id={path.id}
            className={`wind-background__path ${path.className}`}
            d={path.d}
            style={{ '--path-length': path.length } as React.CSSProperties}
          />
        ))}
      </svg>
    </div>
  );
}
