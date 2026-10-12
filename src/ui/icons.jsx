// Line icons, 24px grid, drawn for this app. They inherit currentColor.

const Svg = ({ size = 22, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

export const IList = (p) => (
  <Svg {...p}>
    <path d="M10 6.5h10M10 12h10M10 17.5h10" />
    <path d="M3.8 6.4l1.4 1.4 2.4-2.6M3.8 11.9l1.4 1.4 2.4-2.6" />
    <circle cx="5.6" cy="17.5" r="1.3" />
  </Svg>
);
export const IEuro = (p) => (
  <Svg {...p}>
    <path d="M18 6.6A7 7 0 1 0 18 17.4" />
    <path d="M4.5 10.2h9M4.5 13.8h9" />
  </Svg>
);
export const IBroom = (p) => (
  <Svg {...p}>
    <path d="M19.5 3.5l-6.2 7.3" />
    <path d="M9.6 9.6l5 3.9-2.3 7H5.4l-1-1.2z" />
    <path d="M8 14.6l2.6 2M6.4 17.2l1.9 1.6" />
  </Svg>
);
export const IPin = (p) => (
  <Svg {...p}>
    <path d="M14.8 3.6l5.6 5.6-2.3.9-3.6 3.6.4 3.8-1.6 1.6-3.9-3.9-4.8 4.8M10.4 13.2l-3.8-3.8L8.2 7.8l3.8.4 3.6-3.6z" />
  </Svg>
);
export const ISliders = (p) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
);
export const IPlus = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const ICheck = (p) => (
  <Svg {...p}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </Svg>
);
export const IX = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IDots = (p) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);
export const ITrash = (p) => (
  <Svg {...p}>
    <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7M10.2 10.5v5.5M13.8 10.5v5.5" />
  </Svg>
);
export const IPencil = (p) => (
  <Svg {...p}>
    <path d="M4.5 19.5l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.7 18.5z" />
    <path d="M13.8 7l3.2 3.2" />
  </Svg>
);
export const IShare = (p) => (
  <Svg {...p}>
    <path d="M12 14.5V3.8M8.2 7.4L12 3.6l3.8 3.8" />
    <path d="M7.5 10.5H6a1.5 1.5 0 0 0-1.5 1.5v6.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
  </Svg>
);
export const ICopy = (p) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Svg>
);
export const ICart = (p) => (
  <Svg {...p}>
    <path d="M3.5 4.5h2.2l2 10.2h10.1l1.9-7.2H6.6" />
    <circle cx="9.3" cy="18.8" r="1.4" />
    <circle cx="16.4" cy="18.8" r="1.4" />
  </Svg>
);
export const IReceipt = (p) => (
  <Svg {...p}>
    <path d="M6 3.8h12v16.4l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" />
    <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
  </Svg>
);
export const ISwap = (p) => (
  <Svg {...p}>
    <path d="M4.5 8.5h13.5M14.5 5l3.5 3.5-3.5 3.5" />
    <path d="M19.5 15.5H6M9.5 12L6 15.5 9.5 19" />
  </Svg>
);
export const IJar = (p) => (
  <Svg {...p}>
    <path d="M8 3.8h8M8.8 3.8v2.6C6.2 7.4 5 9.2 5 11.6v6A2.6 2.6 0 0 0 7.6 20.2h8.8a2.6 2.6 0 0 0 2.6-2.6v-6c0-2.4-1.2-4.2-3.8-5.2V3.8" />
    <circle cx="12" cy="14" r="2.6" />
  </Svg>
);
export const IScale = (p) => (
  <Svg {...p}>
    <path d="M12 4v16M7.5 20h9M5 7.5h14" />
    <path d="M5 7.5l-2.5 6a2.8 2.8 0 0 0 5 0zM19 7.5l-2.5 6a2.8 2.8 0 0 0 5 0z" />
  </Svg>
);
export const IChevron = (p) => (
  <Svg {...p}>
    <path d="M7 9.5l5 5 5-5" />
  </Svg>
);
export const IBack = (p) => (
  <Svg {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
);
export const ICloudOff = (p) => (
  <Svg {...p}>
    <path d="M3.5 3.5l17 17" />
    <path d="M8.2 8.2A4.8 4.8 0 0 0 6.5 17.5h10M19.4 16.7A3.8 3.8 0 0 0 17 10.1a5.6 5.6 0 0 0-7.4-4.2" />
  </Svg>
);
export const IQr = (p) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM20 14v1.5M14 20h1.5" />
  </Svg>
);
export const IDownload = (p) => (
  <Svg {...p}>
    <path d="M12 4v11M7.8 11l4.2 4.2 4.2-4.2M5 19.5h14" />
  </Svg>
);
export const IRefresh = (p) => (
  <Svg {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4.2h-4.2" />
  </Svg>
);
export const IUndo = (p) => (
  <Svg {...p}>
    <path d="M9 14.5L4.5 10 9 5.5" />
    <path d="M4.5 10H14a5.5 5.5 0 0 1 0 11h-3" />
  </Svg>
);
export const IHand = (p) => (
  <Svg {...p}>
    <path d="M8.5 11V5.8a1.4 1.4 0 0 1 2.8 0V11M11.3 10V4.6a1.4 1.4 0 0 1 2.8 0V10M14.1 10.5V6a1.4 1.4 0 0 1 2.8 0v7.2c0 4-2.3 6.8-5.9 6.8-2.5 0-4-1.2-5.3-3.4l-2-3.6a1.4 1.4 0 0 1 2.4-1.4l1.6 2.1V8.2a1.4 1.4 0 0 1 2.8 0" />
  </Svg>
);
export const IEye = (p) => (
  <Svg {...p}>
    <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);
