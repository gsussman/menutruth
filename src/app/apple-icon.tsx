import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFFFFF",
          borderRadius: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            width: 120,
          }}
        >
          <div
            style={{
              width: 70,
              height: 22,
              borderRadius: 11,
              background: "#00A878",
            }}
          />
          <div
            style={{
              width: 100,
              height: 22,
              borderRadius: 11,
              background: "#F25F5C",
              marginLeft: 20,
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
