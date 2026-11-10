import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "wokwi-neopixel-matrix": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { cols?: number; rows?: number };
      "wokwi-led-ring": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        pixels?: number;
      };
    }
  }
}
