import { useState, useRef } from "react";

export const useBlurBackdrop = () => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [blurDimensions, setBlurDimensions] = useState({
    width: `${menuRef.current?.clientHeight}px`,
    height: `${menuRef.current?.clientWidth}px`,
  });

  return { menuRef, blurDimensions, setBlurDimensions };
};
