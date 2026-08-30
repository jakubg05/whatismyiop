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
      <div className="nav-data" aria-label={hasData ? `${fileName}, ${measurementCount.toLocaleString()} records stored locally` : "No records loaded"}>
        <strong>{hasData ? fileName : "No file selected"}</strong>
        <span>{measurementCount.toLocaleString()} records locally</span>
      </div>
    </header>
  );
}
