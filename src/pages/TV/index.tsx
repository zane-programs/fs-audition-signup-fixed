import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Spinner } from "@chakra-ui/react";

// hooks
import { useWindowDimensions } from "../../utils/hooks";

// components
import GlitchText from "./GlitchText";

// media
import tvVideo from "../../assets/media/Audition_Promo_TABLING_TV_v3.mp4";
import tvStaticAudio from "../../assets/media/tv_static.mp3";

// styles
import styles from "./TV.module.css";

export const tvIntercom = new BroadcastChannel("tv_intercom");

export default function TV() {
  const { width, height } = useWindowDimensions();

  const [videoLoaded, setVideoLoaded] = useState(false);

  const [isShowingOverlay, setIsShowingOverlay] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");

  const [shouldStretch, setShouldStretch] = useState(true);

  // const overlayTimeout = useRef<NodeJS.Timeout>();
  const videoRef = useRef<HTMLVideoElement>(null);

  const playSound = useCallback((volume?: number) => {
    return new Promise<void>((resolve, reject) => {
      try {
        const audio = new Audio(tvStaticAudio);
        audio.volume = volume ?? 1;
        audio.addEventListener("ended", function () {
          this.remove();
          resolve();
        });
        audio.play();
      } catch (e) {
        reject(e);
      }
    });
  }, []);

  // Show overlay when page gets special message
  useEffect(() => {
    function onMessage({ data }: MessageEvent<any>) {
      if (
        typeof data === "object" &&
        data?.action === "showUserOverlay" &&
        data?.name
      ) {
        setCurrentUserName(data.name);
        setIsShowingOverlay(true);
      }
    }

    tvIntercom.addEventListener("message", onMessage);

    return () => {
      tvIntercom.removeEventListener("message", onMessage);
    };
  }, []);

  // Auto-hide overlay after 4500ms
  useEffect(() => {
    if (isShowingOverlay) {
      videoRef.current?.pause();
      playSound()
        .then(() => {
          console.log("sound played");
          setIsShowingOverlay(false);
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      videoRef.current?.play();
    }
  }, [isShowingOverlay, playSound]);

  return (
    <Box
      overflow="hidden"
      userSelect="none"
      onContextMenu={(e) => {
        e.preventDefault();
        setShouldStretch((prev) => !prev);
      }}
      onDoubleClick={() => {
        document.documentElement.requestFullscreen({ navigationUI: "hide" });
        // if (videoRef.current) videoRef.current.muted = false;
      }}
      style={{ width, height }}
    >
      <Box
        position="relative"
        margin="0 auto"
        // 4:3 aspect ratio
        style={{ width: width, height: height }}
      >
        {!videoLoaded && (
          <Spinner
            size="lg"
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
          />
        )}
        <Overlay name={currentUserName} isShowing={isShowingOverlay} />
        <video
          ref={videoRef}
          style={{
            width: "100%",
            height: "100%",
            transform: shouldStretch
              ? "scaleX(1.2) scaleY(0.97) translate(-11px,-6px)"
              : undefined,
          }}
          onPlay={() => setVideoLoaded(true)}
          autoPlay
          loop
          playsInline
          muted
        >
          <source src={tvVideo} type="video/mp4" />
        </video>
      </Box>
    </Box>
  );
}

function Overlay({ name, isShowing }: { name: string; isShowing: boolean }) {
  const { height } = useWindowDimensions();

  const baseFontSize = useMemo(() => (height * (4 / 3)) / 75, [height]);
  const nameFontSize = useMemo(
    () => `${Math.max(baseFontSize * 16 - 30 * Math.log(name.length), 10)}px`,
    [baseFontSize, name.length]
  );

  return (
    <Box
      className={styles.tvStatic}
      zIndex="100"
      w="100%"
      height="100%"
      position="absolute"
      fontFamily="'Playfair Display', serif"
      fontWeight="700"
      textAlign="center"
      display="flex"
      flexDir="column"
      gap="1"
      alignItems="center"
      justifyContent="center"
      opacity={isShowing ? 1 : 0}
      transition="opacity 125ms ease"
      style={{ fontSize: baseFontSize }}
      aria-hidden={!isShowing}
    >
      <Box fontSize="20em" fontWeight="900" marginBottom="1">
        HEY
      </Box>
      <Box
        style={{
          fontSize: nameFontSize,
        }}
        paddingBottom="0.9em"
        textTransform="uppercase"
        marginTop="-14vh"
        fontWeight="700"
      >
        <GlitchText textOverflow="ellipsis">{name}</GlitchText>
      </Box>
    </Box>
  );
}
