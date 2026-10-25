import { FC, ReactNode } from "react";

type PageWrapperProps = {
  children: ReactNode;
};

export const PageWrapper: FC<PageWrapperProps> = ({ children }) => {
  return (
    // dvh so the page tracks the mobile browser chrome (url bar) instead of
    // being taller than the visible viewport; h-screen keeps the layout on
    // browsers without dvh support.
    <div className="relative w-screen h-screen supports-[height:100dvh]:h-[100dvh] bg-gray-900">
      {children}
    </div>
  );
};
