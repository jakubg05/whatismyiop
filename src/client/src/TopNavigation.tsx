import { Button } from "./ui";

type TopNavigationProps = {
  fileName: string;
  measurementCount: number;
  onClearData: () => void;
  onChooseFile: () => void;
};

export function TopNavigation({ fileName, measurementCount, onClearData, onChooseFile }: TopNavigationProps) {
  return (
    <header className="app-topbar">
      <div className="app-brand">
        <img src="/whatismyiop_mark_black.svg" alt="" />
      </div>
      <div className="nav-data" aria-label={`${fileName}, ${measurementCount.toLocaleString()} measurements`}>
        <strong>{fileName}</strong>
        <span>{measurementCount.toLocaleString()} measurements</span>
      </div>
      <div className="file-actions">
        <Button variant="quiet" className="clear-button" onClick={onClearData}>Clear data</Button>
        <Button variant="primary" className="file-button" onClick={onChooseFile}>Choose CSV</Button>
      </div>
    </header>
  );
}
