import { Button } from "./shared";

export function TopNavigation() {
  return (
    <header className="app-topbar">
      <div className="app-brand">
        <img src="/whatismyiop_mark_black.svg" alt="" />
        <strong>WhatIsMyIop.com</strong>
      </div>
      <Button type="button" variant="quiet">Take a tour</Button>
    </header>
  );
}
