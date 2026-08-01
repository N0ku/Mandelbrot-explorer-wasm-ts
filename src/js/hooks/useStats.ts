import { useCallback, useState, useRef } from "react";

interface Stats {
  totalGenerationTime: number;
  averageGenerationTime: number;
  averageTaskTime: number;
  totalIterations: number;
  generationCount: number;
  pixelExecutions: number;
  rowExecutions: number;
  gridExecutions: number;
  columnExecutions: number;
  autoExecutions: number;
  taskCount: number;
  bestTime: number;
  worstTime: number;
  lastGenerationTime: number;
  systemInfo: {
    cores: number;
    userAgent: string;
    platform: string;
  };
}

export function useStats() {
  const [stats, setStats] = useState<Stats>({
    totalGenerationTime: 0,
    averageGenerationTime: 0,
    averageTaskTime: 0,
    totalIterations: 0,
    generationCount: 0,
    pixelExecutions: 0,
    rowExecutions: 0,
    gridExecutions: 0,
    columnExecutions: 0,
    autoExecutions: 0,
    taskCount: 0,
    bestTime: Number.MAX_VALUE,
    worstTime: 0,
    lastGenerationTime: 0,
    systemInfo: {
      cores: navigator.hardwareConcurrency || 4,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    },
  });

  const startTimeRef = useRef<number>(0);
  const currentIterationsRef = useRef<number>(0);
  const currentTaskCountRef = useRef<number>(0);

  const startGeneration = useCallback(
    (iterations: number, taskCount: number) => {
      startTimeRef.current = performance.now();
      currentIterationsRef.current = iterations;
      currentTaskCountRef.current = taskCount;
    },
    []
  );

  const endGeneration = useCallback((fractalType: string) => {
    const endTime = performance.now();
    const generationTime = endTime - startTimeRef.current;

    setStats((prevStats) => {
      const newGenerationCount = prevStats.generationCount + 1;
      const newTotalTime = prevStats.totalGenerationTime + generationTime;
      const newTaskCount = prevStats.taskCount + currentTaskCountRef.current;

      // Calculate averages
      const newAverageGenerationTime = newTotalTime / newGenerationCount;
      const newAverageTaskTime = newTotalTime / newTaskCount;

      // Update best/worst times
      const newBestTime = Math.min(
        prevStats.bestTime === Number.MAX_VALUE
          ? generationTime
          : prevStats.bestTime,
        generationTime
      );
      const newWorstTime = Math.max(prevStats.worstTime, generationTime);

      // Update fractal type counters
      const typeKey = `${fractalType}Executions` as keyof Stats;
      const currentTypeCount = (prevStats[typeKey] as number) || 0;

      return {
        ...prevStats,
        totalGenerationTime: newTotalTime,
        averageGenerationTime: newAverageGenerationTime,
        averageTaskTime: newAverageTaskTime,
        totalIterations:
          prevStats.totalIterations + currentIterationsRef.current,
        generationCount: newGenerationCount,
        taskCount: newTaskCount,
        bestTime: newBestTime,
        worstTime: newWorstTime,
        lastGenerationTime: generationTime,
        [typeKey]: currentTypeCount + 1,
      };
    });

    // Log performance info
    console.log(
      `${fractalType} fractal generation completed in ${generationTime.toFixed(
        2
      )}ms`
    );
  }, []);

  const resetStats = useCallback(() => {
    setStats((prevStats) => ({
      ...prevStats,
      totalGenerationTime: 0,
      averageGenerationTime: 0,
      averageTaskTime: 0,
      totalIterations: 0,
      generationCount: 0,
      pixelExecutions: 0,
      rowExecutions: 0,
      gridExecutions: 0,
      columnExecutions: 0,
      autoExecutions: 0,
      taskCount: 0,
      bestTime: Number.MAX_VALUE,
      worstTime: 0,
      lastGenerationTime: 0,
    }));
  }, []);

  const addCachedIterations = useCallback((iterations: number) => {
    setStats((prevStats) => ({
      ...prevStats,
      totalIterations: prevStats.totalIterations + iterations,
    }));
  }, []);

  return {
    stats,
    startGeneration,
    endGeneration,
    resetStats,
    addCachedIterations,
  };
}
