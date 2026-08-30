type TopNavigationProps = {
  fileName: string;
  measurementCount: number;
  hasData: boolean;
};

export function TopNavigation({ fileName, measurementCount, hasData }: TopNavigationProps) {
  return (
    <header className="app-topbar">
      <div className="app-brand">
        <img src="/whatismyiop_mark_black.svg" alt="" />
        <strong>WhatIsMyIop.com</strong>
      </div>
      {hasData && <div className="nav-data" aria-label={`${fileName}, ${measurementCount.toLocaleString()} records stored locally`}>
        <strong>{fileName}</strong>
        <span>{measurementCount.toLocaleString()} records locally</span>
      </div>}
    </header>
  );
}
