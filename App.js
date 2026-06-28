import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
  FlatList,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";

// ── Constantes ────────────────────────────────────────────
const TABS = ["home", "history", "settings"];

// ── Utilitários ───────────────────────────────────────────
function formatTime(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const isHoje = d.toDateString() === hoje.toDateString();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return isHoje
    ? `Hoje · ${h}:${m}`
    : `${d.getDate()}/${d.getMonth() + 1} · ${h}:${m}`;
}

// ── App ───────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("home");
  const [ip, setIp] = useState("");
  const [connected, setConnected] = useState(false);
  const [modoCamera, setModoCamera] = useState(false);
  const [lastPhoto, setLastPhoto] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [statusMsg, setStatusMsg] = useState("");
  const [history, setHistory] = useState([]);
  const cameraRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem("ip").then((v) => {
      if (v) setIp(v);
    });
    AsyncStorage.getItem("history").then((v) => {
      if (v) setHistory(JSON.parse(v));
    });
  }, []);

  const saveHistory = async (items) => {
    setHistory(items);
    await AsyncStorage.setItem("history", JSON.stringify(items));
  };

  const getUrl = () => {
    const base = ip.trim();
    return base.startsWith("http") ? base : `http://${base}`;
  };

  const testar = async () => {
    if (!ip.trim()) return;
    setStatus("sending");
    setStatusMsg("Verificando...");
    try {
      const res = await fetch(`${getUrl()}/ping`);
      const json = await res.json();
      if (json.status === "ok") {
        setConnected(true);
        setStatus("done");
        setStatusMsg("Servidor encontrado");
      } else {
        setConnected(false);
        setStatus("error");
        setStatusMsg("Servidor retornou erro");
      }
    } catch (e) {
      setConnected(false);
      setStatus("error");
      setStatusMsg(`Erro: ${e.message}`);
    }
  };

  // const abrirCamera = async () => {
  //   const { granted } = await ImagePicker.requestCameraPermissionsAsync();
  //   if (!granted) {
  //     setStatus("error");
  //     setStatusMsg("Permissão de câmera negada");
  //     return;
  //   }
  //   const result = await ImagePicker.launchCameraAsync({
  //     quality: 0.9,
  //     allowsEditing: false,
  //   });

  //   if (!result.canceled) {
  //     const uri = result.assets[0].uri;
  //     setLastPhoto(uri);
  //     enviar(uri);
  //   }
  // };
  const abrirCamera = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      setStatus("error");
      setStatusMsg("Permissão de câmera negada");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: false,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setLastPhoto(uri);
      enviar(uri);
    }
  };

  const enviar = async (uri) => {
    if (!ip.trim()) {
      setStatus("error");
      setStatusMsg("Configure o servidor primeiro");
      setTab("settings");
      return;
    }
    setStatus("sending");
    setStatusMsg("Enviando...");
    try {
      const comp = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
      );

      const formData = new FormData();
      formData.append("foto", {
        uri: comp.uri,
        name: `foto_${Date.now()}.jpg`,
        type: "image/jpeg",
      });

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);

      const res = await fetch(`${getUrl()}/foto`, {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data" },
        body: formData,
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (res.ok) {
        setStatus("done");
        setStatusMsg("Foto enviada");
        setLastPhoto(null); // limpa o preview
        setConnected(true);
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {}
        const nome = `foto_${Date.now()}.jpg`;
        const newHistory = [
          {
            id: Date.now(),
            name: nome,
            uri: comp.uri,
            time: new Date().toISOString(),
          },
          ...history,
        ].slice(0, 50);
        await saveHistory(newHistory);
      } else {
        setStatus("error");
        setStatusMsg(`Erro ${res.status}`);
      }
    } catch (e) {
      setStatus("error");
      setStatusMsg(`Falha: ${e.message}`);
    }
  };

  // ── Câmera ────────────────────────────────────────────
  if (modoCamera) {
    return (
      <View style={s.cameraWrap}>
        <StatusBar barStyle="light-content" />
        <CameraView ref={cameraRef} style={s.camera} facing="back" />
        <SafeAreaView style={s.cameraUI}>
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={() => setModoCamera(false)}
          >
            <Text style={s.cancelTxt}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.shutter} onPress={tirarFoto}>
            <View style={s.shutterInner} />
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // ── Layout principal ──────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {tab === "home" && (
        <HomeTab
          lastPhoto={lastPhoto}
          status={status}
          statusMsg={statusMsg}
          connected={connected}
          onCamera={abrirCamera}
        />
      )}

      {/* {tab === "history" && <HistoryTab history={history} />} */}
      {tab === "history" && (
        <HistoryTab
          history={history}
          onDelete={(id) => {
            const novo = history.filter((h) => h.id !== id);
            saveHistory(novo);
          }}
        />
      )}

      {tab === "settings" && (
        <SettingsTab
          ip={ip}
          setIp={(v) => {
            setIp(v);
            AsyncStorage.setItem("ip", v);
          }}
          onTest={testar}
          status={status}
          statusMsg={statusMsg}
          connected={connected}
          historyCount={history.length}
        />
      )}

      {/* Tab bar */}
      <SafeAreaView style={s.tabBarWrap}>
        <View style={s.tabBar}>
          {[
            { key: "home", icon: "⬜", label: "Início" },
            { key: "history", icon: "🕐", label: "Histórico" },
            { key: "settings", icon: "⚙", label: "Config" },
          ].map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={s.tabItem}
              onPress={() => setTab(key)}
            >
              <View style={[s.tabDot, tab === key && s.tabDotActive]} />
              <Text style={[s.tabLabel, tab === key && s.tabLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Tela Home ─────────────────────────────────────────────
function HomeTab({ lastPhoto, status, statusMsg, connected, onCamera }) {
  const sending = status === "sending";

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.homeHeader}>
        <Text style={s.homeTitle}>FotoShare</Text>
        <View style={[s.dot, connected ? s.dotGreen : s.dotGray]} />
      </View>

      <View style={s.previewWrap}>
        {lastPhoto ? (
          <Image source={{ uri: lastPhoto }} style={s.preview} />
        ) : (
          <View style={s.previewEmpty}>
            <Text style={s.previewEmptyIcon}>📷</Text>
            <Text style={s.previewEmptyTxt}>Nenhuma foto ainda</Text>
          </View>
        )}
      </View>

      <View style={s.homeBottom}>
        {sending ? (
          <ActivityIndicator color="#fff" style={{ marginBottom: 8 }} />
        ) : status === "done" ? (
          <Text style={s.statusDone}>✓ {statusMsg}</Text>
        ) : status === "error" ? (
          <Text style={s.statusErr}>✕ {statusMsg}</Text>
        ) : (
          <Text style={s.statusIdle}> </Text>
        )}

        <TouchableOpacity
          style={[s.cameraBtn, sending && s.cameraBtnDim]}
          onPress={onCamera}
          disabled={sending}
        >
          <Text style={s.cameraBtnTxt}>Tirar foto</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Tela Histórico ────────────────────────────────────────
function HistoryTab({ history, onDelete }) {
  const deletarItem = async (id) => {
    if (onDelete) onDelete(id);
  };
  return (
    <SafeAreaView style={s.screen}>
      <Text style={s.pageTitle}>Histórico</Text>
      {history.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyTxt}>Nenhuma foto enviada ainda</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingHorizontal: 24 }}
          renderItem={({ item }) => (
            <View style={s.histItem}>
              <Image source={{ uri: item.uri }} style={s.histThumb} />
              <View style={s.histInfo}>
                <Text style={s.histName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={s.histTime}>{formatTime(item.time)}</Text>
              </View>
              <TouchableOpacity onPress={() => deletarItem(item.id)}>
                <Text
                  style={{
                    color: "#ff453a",
                    fontSize: 18,
                    paddingHorizontal: 8,
                  }}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

// ── Tela Configurações ────────────────────────────────────
function SettingsTab({
  ip,
  setIp,
  onTest,
  status,
  statusMsg,
  connected,
  historyCount,
}) {
  const testing = status === "sending";
  return (
    <SafeAreaView style={s.screen}>
      <Text style={s.pageTitle}>Configurações</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24 }}>
        <Text style={s.cfgLabel}>SERVIDOR</Text>
        <View style={s.cfgCard}>
          <TextInput
            style={s.cfgInput}
            value={ip}
            onChangeText={setIp}
            placeholder="192.168.1.100:8765"
            placeholderTextColor="#555"
            keyboardType="url"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={s.cfgTestBtn}
            onPress={onTest}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.cfgTestTxt}>Testar conexão</Text>
            )}
          </TouchableOpacity>
          {statusMsg !== "" && (
            <Text style={[s.cfgStatus, connected ? s.statusDone : s.statusErr]}>
              {connected ? "✓" : "✕"} {statusMsg}
            </Text>
          )}
        </View>

        <Text style={s.cfgLabel}>INFORMAÇÕES</Text>
        <View style={s.cfgCard}>
          <View style={s.cfgRow}>
            <Text style={s.cfgRowLabel}>Status</Text>
            <Text
              style={[
                s.cfgRowVal,
                connected ? s.statusDone : { color: "#555" },
              ]}
            >
              {connected ? "Conectado" : "Desconectado"}
            </Text>
          </View>
          <View style={s.cfgDivider} />
          <View style={s.cfgRow}>
            <Text style={s.cfgRowLabel}>Fotos enviadas</Text>
            <Text style={s.cfgRowVal}>{historyCount}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  screen: { flex: 1 },

  // Home
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  homeTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.8,
    flex: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: "#30d158" },
  dotGray: { backgroundColor: "#3a3a3a" },

  previewWrap: {
    flex: 1,
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  preview: { flex: 1, resizeMode: "cover" },
  previewEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  previewEmptyIcon: { fontSize: 36 },
  previewEmptyTxt: { fontSize: 14, color: "#3a3a3a", fontWeight: "500" },

  homeBottom: { paddingHorizontal: 20, paddingBottom: 12 },
  statusDone: {
    color: "#30d158",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "500",
  },
  statusErr: {
    color: "#ff453a",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "500",
  },
  statusIdle: { fontSize: 13, marginBottom: 8 },

  cameraBtn: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
  },
  cameraBtnDim: { opacity: 0.5 },
  cameraBtnTxt: {
    color: "#000",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.3,
  },

  // History
  pageTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.8,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyTxt: { color: "#3a3a3a", fontSize: 15, fontWeight: "500" },

  histItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 14,
  },
  histThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#1a1a1a",
  },
  histInfo: { flex: 1 },
  histName: { fontSize: 14, color: "#e5e5e5", fontWeight: "500" },
  histTime: { fontSize: 12, color: "#555", marginTop: 2 },
  histCheck: { color: "#30d158", fontSize: 14, fontWeight: "600" },
  separator: { height: 0.5, backgroundColor: "#1e1e1e" },

  // Settings
  cfgLabel: {
    fontSize: 11,
    color: "#555",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
  },
  cfgCard: {
    backgroundColor: "#111",
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  cfgInput: {
    color: "#fff",
    fontSize: 15,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#2a2a2a",
    marginBottom: 14,
  },
  cfgTestBtn: {
    backgroundColor: "#1c1c1c",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  cfgTestTxt: { color: "#fff", fontSize: 15, fontWeight: "600" },
  cfgStatus: {
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
    fontWeight: "500",
  },
  cfgRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  cfgRowLabel: { fontSize: 15, color: "#e5e5e5" },
  cfgRowVal: { fontSize: 15, color: "#555" },
  cfgDivider: { height: 0.5, backgroundColor: "#2a2a2a" },

  // Camera
  cameraWrap: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraUI: { position: "absolute", bottom: 0, left: 0, right: 0 },
  cancelBtn: { position: "absolute", top: -520, left: 24 },
  cancelTxt: { color: "#fff", fontSize: 17, fontWeight: "500" },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: "#fff",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#fff",
  },

  // Tab bar
  tabBarWrap: {
    backgroundColor: "#000",
    borderTopWidth: 0.5,
    borderTopColor: "#1a1a1a",
    paddingBottom: 24,
  },
  tabBar: { flexDirection: "row", paddingTop: 10, paddingBottom: 8 },
  tabItem: { flex: 1, alignItems: "center", gap: 4 },
  tabDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "transparent",
  },
  tabDotActive: { backgroundColor: "#fff" },
  tabLabel: { fontSize: 10, color: "#555", fontWeight: "500" },
  tabLabelActive: { color: "#fff" },
});
