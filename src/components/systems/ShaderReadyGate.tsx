import { FC, useLayoutEffect, useRef } from "react";

import { useFrame, useThree } from "@react-three/fiber";

type ShaderReadyGateProps = {
  compileKey: string;
  onReadyChange: (ready: boolean) => void;
};

const COMPILE_TIMEOUT_MS = 10_000;

type CompileSession = {
  generation: number;
  compileStarted: boolean;
  cancelled: boolean;
  hasRetried: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
  retryTimeoutId: ReturnType<typeof setTimeout> | null;
};

export const ShaderReadyGate: FC<ShaderReadyGateProps> = ({
  compileKey,
  onReadyChange,
}) => {
  const { gl, scene, camera } = useThree();
  const onReadyChangeRef = useRef(onReadyChange);
  const generationRef = useRef(0);
  const sessionRef = useRef<CompileSession | null>(null);

  useLayoutEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useLayoutEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;

    const session: CompileSession = {
      generation,
      compileStarted: false,
      cancelled: false,
      hasRetried: false,
      timeoutId: null,
      retryTimeoutId: null,
    };
    sessionRef.current = session;

    onReadyChangeRef.current(false);

    return () => {
      session.cancelled = true;
      sessionRef.current = null;
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }
      if (session.retryTimeoutId) {
        clearTimeout(session.retryTimeoutId);
      }
      onReadyChangeRef.current(false);
    };
  }, [compileKey, gl, scene, camera]);

  useFrame(() => {
    const session = sessionRef.current;
    if (!session || session.compileStarted || session.cancelled) {
      return;
    }

    session.compileStarted = true;

    const setReady = (ready: boolean) => {
      if (!session.cancelled && generationRef.current === session.generation) {
        onReadyChangeRef.current(ready);
      }
    };

    const finish = () => {
      if (session.cancelled || generationRef.current !== session.generation) {
        return;
      }

      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
        session.timeoutId = null;
      }
      if (session.retryTimeoutId) {
        clearTimeout(session.retryTimeoutId);
        session.retryTimeoutId = null;
      }

      setReady(true);
    };

    const runCompile = () => {
      if (session.cancelled || generationRef.current !== session.generation) {
        return;
      }

      if (typeof gl.compileAsync === "function") {
        gl.compileAsync(scene, camera).then(finish).catch(finish);
      } else {
        gl.compile(scene, camera);
        queueMicrotask(finish);
      }
    };

    setReady(false);
    runCompile();

    session.timeoutId = setTimeout(() => {
      if (session.cancelled || generationRef.current !== session.generation) {
        return;
      }

      if (!session.hasRetried) {
        session.hasRetried = true;
        console.warn(
          "ShaderReadyGate: compile timed out, retrying once",
          compileKey
        );
        runCompile();

        session.retryTimeoutId = setTimeout(() => {
          if (
            session.cancelled ||
            generationRef.current !== session.generation
          ) {
            return;
          }

          console.warn(
            "ShaderReadyGate: compile retry timed out, proceeding anyway",
            compileKey
          );
          finish();
        }, COMPILE_TIMEOUT_MS);
      }
    }, COMPILE_TIMEOUT_MS);
  });

  return null;
};
