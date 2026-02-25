import { CSSProperties } from 'react';

export type AppIconName =
  | 'logo'
  | 'menu'
  | 'channel'
  | 'group'
  | 'settings'
  | 'logout'
  | 'close'
  | 'phone'
  | 'micOn'
  | 'micOff'
  | 'chat'
  | 'download'
  | 'paperclip'
  | 'image'
  | 'music'
  | 'video'
  | 'emoji'
  | 'send'
  | 'camera'
  | 'trash'
  | 'lock'
  | 'save'
  | 'arrowLeft'
  | 'dashboard'
  | 'user'
  | 'messages'
  | 'storage'
  | 'backup'
  | 'paint'
  | 'film'
  | 'crown';

interface AppIconProps {
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

function IconPaths({ name }: { name: AppIconName }) {
  switch (name) {
    case 'logo':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25c2.485 2.156 3.75 4.453 3.75 6.75A3.75 3.75 0 018.25 9c0-1.375.5-2.5 1.5-3.75-3 1.5-4.5 4.125-4.5 7.125A6.75 6.75 0 0012 19.125a6.75 6.75 0 006.75-6.75c0-3.384-2.27-6.451-6.75-10.125Z" />;
    case 'menu':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />;
    case 'channel':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h10.5m0 0L11.25 9m3 3-3 3m5.25-6h3.75m-3.75 6h3.75" />;
    case 'group':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.25a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a4.5 4.5 0 019 0m1.5 0a4.5 4.5 0 019 0" />
        </>
      );
    case 'settings':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6h15M4.5 12h15m-15 6h15" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0Zm10.5 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0Zm-7.5 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0Z" />
        </>
      );
    case 'logout':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.625A2.625 2.625 0 0013.125 3h-6.75A2.625 2.625 0 003.75 5.625v12.75A2.625 2.625 0 006.375 21h6.75a2.625 2.625 0 002.625-2.625V15m-6-3h11.25m0 0-3-3m3 3-3 3" />;
    case 'close':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />;
    case 'phone':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 4.5A2.25 2.25 0 014.5 2.25h2.373c.966 0 1.785.694 1.969 1.642l.547 2.734a1.875 1.875 0 01-.529 1.767l-1.038 1.038a11.255 11.255 0 005.303 5.303l1.038-1.038a1.875 1.875 0 011.767-.529l2.734.547A2.006 2.006 0 0121.75 17.127V19.5a2.25 2.25 0 01-2.25 2.25h-.75C9.059 21.75 2.25 14.941 2.25 6.75V4.5Z" />;
    case 'micOn':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75a2.25 2.25 0 00-2.25 2.25v6a2.25 2.25 0 104.5 0V6A2.25 2.25 0 0012 3.75Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 10.5v1.5a5.25 5.25 0 0010.5 0v-1.5M12 17.25V21" />
        </>
      );
    case 'micOff':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75a2.25 2.25 0 00-2.25 2.25v2.25m0 3.75a2.25 2.25 0 104.5 0V9.75" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 10.5v1.5a5.25 5.25 0 0010.5 0v-1.5M12 17.25V21M4.5 4.5l15 15" />
        </>
      );
    case 'chat':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12c0-4.28 3.47-7.75 7.75-7.75h4c4.28 0 7.75 3.47 7.75 7.75s-3.47 7.75-7.75 7.75H9.75l-4.5 2.25.75-3.75A7.74 7.74 0 012.25 12Z" />;
    case 'download':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v10.5m0 0-3-3m3 3 3-3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 17.25v2.25c0 .621.504 1.125 1.125 1.125h14.25c.621 0 1.125-.504 1.125-1.125v-2.25" />
        </>
      );
    case 'paperclip':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739 10.682 20.432a4.5 4.5 0 01-6.364-6.364l8.047-8.047a3 3 0 114.243 4.243L8.56 18.312a1.5 1.5 0 01-2.121-2.122l7.424-7.424" />;
    case 'image':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 011.5-1.5Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m21.75 16.5-4.41-4.41a1.5 1.5 0 00-2.12 0l-1.84 1.84-1.59-1.59a1.5 1.5 0 00-2.12 0L2.25 19.5" />
        </>
      );
    case 'music':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0Zm10.5-2.25a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18.75V6.75l10.5-2.25v12" />
        </>
      );
    case 'video':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A2.25 2.25 0 016 5.25h8.25a2.25 2.25 0 012.25 2.25v1.324l3.75-2.143v10.648l-3.75-2.143V16.5a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v-9Z" />;
    case 'emoji':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5h.008v.008H9V10.5Zm6 0h.008v.008H15V10.5Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0Z" />
        </>
      );
    case 'send':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12 20.25 3l-5.25 18-3.75-7.5-9-1.5Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 13.5 20.25 3" />
        </>
      );
    case 'camera':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.5A2.25 2.25 0 014.5 5.25h2.379a2.25 2.25 0 001.59-.659l.66-.66a2.25 2.25 0 011.59-.659h2.562a2.25 2.25 0 011.59.659l.66.66a2.25 2.25 0 001.59.659H19.5a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25v-9Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5Z" />
        </>
      );
    case 'trash':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9 14.394 18m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M4.772 5.79A48.108 48.108 0 013.75 5.956m16.5 0a48.11 48.11 0 00-3.478-.397m-12.272 0c1.052-.127 2.113-.233 3.184-.318m0 0a45.003 45.003 0 016.632 0m-6.632 0v-.916c0-1.18.91-2.164 2.09-2.201a51.964 51.964 0 014.82 0c1.18.037 2.09 1.022 2.09 2.201v.916m-6.632 0a48.667 48.667 0 00-3.122.263m9.754-.263c1.055.085 2.112.191 3.167.318m-10.5 14.25h9a2.25 2.25 0 002.244-2.077l.5-9A2.25 2.25 0 0018.75 6H5.25a2.25 2.25 0 00-2.244 2.423l.5 9A2.25 2.25 0 005.75 19.5Z" />;
    case 'lock':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7.875a4.5 4.5 0 10-9 0V10.5m-.75 0h10.5A2.25 2.25 0 0119.5 12.75v6A2.25 2.25 0 0117.25 21h-10.5A2.25 2.25 0 014.5 18.75v-6A2.25 2.25 0 016.75 10.5Z" />;
    case 'save':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 3.75h11.379c.597 0 1.169.237 1.591.659l2.871 2.871c.422.422.659.994.659 1.591V19.5a2.25 2.25 0 01-2.25 2.25H4.5A2.25 2.25 0 012.25 19.5V6A2.25 2.25 0 014.5 3.75Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75v4.5h6v-4.5m-5.25 10.5h7.5" />
        </>
      );
    case 'arrowLeft':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />;
    case 'dashboard':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 19.5h16.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 16.5V9.75m5.25 6.75V4.5m5.25 12V12" />
        </>
      );
    case 'user':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20.25a7.5 7.5 0 0115 0" />
        </>
      );
    case 'messages':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 7.5v9A2.25 2.25 0 0119.5 18.75H4.5A2.25 2.25 0 012.25 16.5v-9A2.25 2.25 0 014.5 5.25h15A2.25 2.25 0 0121.75 7.5ZM3 7.5l9 6 9-6" />;
    case 'storage':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5c0 1.864 3.694 3.375 8.25 3.375s8.25-1.511 8.25-3.375-3.694-3.375-8.25-3.375-8.25 1.511-8.25 3.375Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12c0 1.864 3.694 3.375 8.25 3.375s8.25-1.511 8.25-3.375M3.75 16.5c0 1.864 3.694 3.375 8.25 3.375s8.25-1.511 8.25-3.375" />
        </>
      );
    case 'backup':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5v4.5H3.75V4.5Zm1.5 4.5h13.5v9.75a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5V9Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 13.5h4.5" />
        </>
      );
    case 'paint':
      return <path strokeLinecap="round" strokeLinejoin="round" d="m14.25 4.5 5.25 5.25M6 12l8.25-8.25a2.121 2.121 0 113 3L9 15l-3 1 1-4Zm.75 4.5c-1.5 0-3 1.125-3 2.625 0 1.125.75 2.25 3 2.25s3-1.125 3-2.25c0-1.5-1.5-2.625-3-2.625Z" />;
    case 'film':
      return (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5A1.5 1.5 0 0121.75 6v12a1.5 1.5 0 01-1.5 1.5H3.75A1.5 1.5 0 012.25 18V6a1.5 1.5 0 011.5-1.5Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 4.5v15m9-15v15M3.75 9H7.5m-3.75 6H7.5m9-6h3.75m-3.75 6h3.75" />
        </>
      );
    case 'crown':
      return <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 18.75h16.5l-1.5-9-4.5 3-2.25-5.25-2.25 5.25-4.5-3-1.5 9Z" />;
    default:
      return null;
  }
}

export default function AppIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
  style,
  className,
}: AppIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <IconPaths name={name} />
    </svg>
  );
}
