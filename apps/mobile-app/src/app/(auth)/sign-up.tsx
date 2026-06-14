import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "@clerk/expo";

import { NativeAuthView } from "@/components/auth/native-auth-view";

export default function SignUpScreen() {
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    if (session?.status === "active") {
      router.replace("/" as never);
    }
  }, [router, session?.status]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0B0A0C" }}>
      <NativeAuthView mode="signUp" isDismissible={false} />
    </View>
  );
}
