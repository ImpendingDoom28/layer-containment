import { FC, ReactNode } from "react";

type PageWrapperProps = {
  children: ReactNode;
};

export const PageWrapper: FC<PageWrapperProps> = ({ children }) => {
  return (
    // dvh so the page tracks the mobile browser chrome (url bar) instead of
    // being taller than the visible viewport.
    <div className="relative w-screen h-[100dvh] bg-gray-900">{children}</div>
  );
};
