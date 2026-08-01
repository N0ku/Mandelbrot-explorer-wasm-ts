import { useCallback, useRef, useState } from "react";
import { HistoryManager, FractalState } from "../HistoryMemento";

export function useHistory() {
  const historyManagerRef = useRef(new HistoryManager());
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const isStateChangeFromHistoryRef = useRef(false);

  const saveState = useCallback((state: FractalState) => {
    if (!isStateChangeFromHistoryRef.current) {
      historyManagerRef.current.saveState(state);
      updateNavigationState();
    }
    isStateChangeFromHistoryRef.current = false;
  }, []);

  const updateNavigationState = useCallback(() => {
    setCanGoBack(historyManagerRef.current.hasPrevious());
    setCanGoForward(historyManagerRef.current.hasNext());
  }, []);

  const goBack = useCallback(() => {
    const prevState = historyManagerRef.current.getPreviousState();
    if (prevState) {
      isStateChangeFromHistoryRef.current = true;
      updateNavigationState();
      return prevState;
    }
    return null;
  }, [updateNavigationState]);

  const goForward = useCallback(() => {
    const nextState = historyManagerRef.current.getNextState();
    if (nextState) {
      isStateChangeFromHistoryRef.current = true;
      updateNavigationState();
      return nextState;
    }
    return null;
  }, [updateNavigationState]);

  return {
    saveState,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    isStateChangeFromHistory: isStateChangeFromHistoryRef.current,
  };
}
