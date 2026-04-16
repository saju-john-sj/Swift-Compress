import * as React from "react"
import { cn } from "@/lib/utils"

export interface SliderProps {
  className?: string
  value: number[]
  onValueChange: (value: number[]) => void
  min?: number
  max?: number
  step?: number
}

function Slider({ className, value, onValueChange, min = 0, max = 100, step = 1 }: SliderProps) {
  const percentage = ((value[0] - min) / (max - min)) * 100

  return (
    <div className={cn("relative flex w-full h-5 touch-none select-none items-center group", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={(e) => onValueChange([parseInt(e.target.value)])}
        className="absolute w-full h-full opacity-0 cursor-pointer z-20"
      />
      <div className="relative w-full h-2 bg-secondary rounded-full overflow-hidden z-0">
        <div 
          className="absolute h-full bg-primary transition-all duration-150" 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div 
        className="absolute size-5 rounded-full border-2 border-primary bg-white shadow-sm pointer-events-none z-10 transition-all duration-150 group-hover:scale-110"
        style={{ left: `calc(${percentage}% - 10px)` }}
      />
    </div>
  )
}

export { Slider }
