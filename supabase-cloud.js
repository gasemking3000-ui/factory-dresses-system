/* =========================================================
   ALKAZRAJI FACTORY - SUPABASE CLOUD BRIDGE
   Stable version
   ========================================================= */

(function () {
  "use strict";

  const CONFIG_KEY = "ALKAZRAJI_SUPABASE_CONFIG_V2";
  const DEVICE_KEY = "ALKAZRAJI_DEVICE_ID_V2";
  const TABLE_NAME = "factory_state";
  const CLOUD_ROW_ID = 1;

  let supabaseClient = null;
  let cloudTimer = null;
  let isPulling = false;
  let isPushing = false;
  let lastCloudTimestamp = "";
  let databaseStorageKey = null;

  const originalSaveDB =
    typeof window.saveDB === "function"
      ? window.saveDB
      : null;

  let deviceId = localStorage.getItem(DEVICE_KEY);

  if (!deviceId) {
    deviceId =
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) +
          Math.random().toString(36).slice(2);

    localStorage.setItem(DEVICE_KEY, deviceId);
  }

  function showCloudStatus(message, success) {
    let box = document.getElementById("alkazrajiCloudStatus");

    if (!box) {
      box = document.createElement("div");
      box.id = "alkazrajiCloudStatus";
      box.style.position = "fixed";
      box.style.left = "12px";
      box.style.bottom = "15px";
      box.style.zIndex = "99999";
      box.style.padding = "9px 13px";
      box.style.borderRadius = "13px";
      box.style.fontFamily = "system-ui, sans-serif";
      box.style.fontSize = "12px";
      box.style.fontWeight = "700";
      box.style.boxShadow = "0 4px 18px rgba(0,0,0,.12)";
      box.style.transition = ".2s";
      document.body.appendChild(box);
    }

    box.textContent = message;

    if (success) {
      box.style.background = "#ecfdf5";
      box.style.color = "#047857";
      box.style.border = "1px solid #a7f3d0";
    } else {
      box.style.background = "#fff7ed";
      box.style.color = "#c2410c";
      box.style.border = "1px solid #fed7aa";
    }
  }

  function getConfig() {
    try {
      return JSON.parse(
        localStorage.getItem(CONFIG_KEY) || "null"
      );
    } catch (error) {
      console.error("Supabase config error:", error);
      return null;
    }
  }

  function saveConfig(config) {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify(config)
    );
  }

  function isValidConfig(config) {
    return !!(
      config &&
      config.url &&
      config.key &&
      /^https:\/\/.+\.supabase\.co\/?$/.test(config.url)
    );
  }

  function looksLikeFactoryDatabase(value) {
    if (!value || typeof value !== "object") return false;

    return (
      Array.isArray(value.dresses) &&
      Array.isArray(value.orders) &&
      Array.isArray(value.customers) &&
      Array.isArray(value.expenses)
    );
  }

  function findDatabaseStorageKey() {
    if (databaseStorageKey) {
      const existing =
        localStorage.getItem(databaseStorageKey);

      if (existing) {
        try {
          if (
            looksLikeFactoryDatabase(
              JSON.parse(existing)
            )
          ) {
            return databaseStorageKey;
          }
        } catch (e) {}
      }
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (
        key === CONFIG_KEY ||
        key === DEVICE_KEY
      ) {
        continue;
      }

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);

        if (looksLikeFactoryDatabase(parsed)) {
          databaseStorageKey = key;
          console.log(
            "ALKAZRAJI database key found:",
            key
          );
          return key;
        }
      } catch (e) {}
    }

    return null;
  }

  function readLocalDatabase() {
    const key = findDatabaseStorageKey();

    if (!key) {
      return {
        dresses: [],
        orders: [],
        customers: [],
        expenses: []
      };
    }

    try {
      const data = JSON.parse(
        localStorage.getItem(key) || "{}"
      );

      return {
        dresses: Array.isArray(data.dresses)
          ? data.dresses
          : [],
        orders: Array.isArray(data.orders)
          ? data.orders
          : [],
        customers: Array.isArray(data.customers)
          ? data.customers
          : [],
        expenses: Array.isArray(data.expenses)
          ? data.expenses
          : []
      };
    } catch (error) {
      console.error(
        "Local database read error:",
        error
      );

      return {
        dresses: [],
        orders: [],
        customers: [],
        expenses: []
      };
    }
  }

  function writeLocalDatabase(data) {
    const key = findDatabaseStorageKey();

    if (!key) {
      console.error(
        "Could not find factory database storage key."
      );
      return false;
    }

    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          dresses: Array.isArray(data.dresses)
            ? data.dresses
            : [],
          orders: Array.isArray(data.orders)
            ? data.orders
            : [],
          customers: Array.isArray(data.customers)
            ? data.customers
            : [],
          expenses: Array.isArray(data.expenses)
            ? data.expenses
            : []
        })
      );

      return true;
    } catch (error) {
      console.error(
        "Local database write error:",
        error
      );
      return false;
    }
  }

  function performOriginalLocalSave() {
    if (!originalSaveDB) {
      console.error(
        "Original saveDB function was not found."
      );

      showCloudStatus(
        "خطأ: دالة الحفظ الأصلية غير موجودة",
        false
      );

      return false;
    }

    try {
      originalSaveDB();
      findDatabaseStorageKey();
      return true;
    } catch (error) {
      console.error(
        "Original saveDB failed:",
        error
      );

      showCloudStatus(
        "تعذر الحفظ المحلي",
        false
      );

      return false;
    }
  }

  async function connectSupabase() {
    const config = getConfig();

    if (!isValidConfig(config)) {
      showCloudStatus(
        "الحفظ المحلي يعمل — السحابة غير مربوطة",
        false
      );
      return false;
    }

    if (!window.supabase) {
      showCloudStatus(
        "مكتبة Supabase غير محملة",
        false
      );
      return false;
    }

    try {
      supabaseClient =
        window.supabase.createClient(
          config.url.replace(/\/$/, ""),
          config.key,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false
            }
          }
        );

      const sessionResult =
        await supabaseClient.auth.getSession();

      if (
        !sessionResult.error &&
        sessionResult.data &&
        sessionResult.data.session
      ) {
        showCloudStatus(
          "متصل بالسحابة ✓",
          true
        );
        return true;
      }

      try {
        const authResult =
          await supabaseClient.auth.signInAnonymously();

        if (!authResult.error) {
          showCloudStatus(
            "متصل بالسحابة ✓",
            true
          );
          return true;
        }
      } catch (authError) {
        console.warn(
          "Anonymous authentication unavailable:",
          authError
        );
      }

      const test =
        await supabaseClient
          .from(TABLE_NAME)
          .select("id")
          .eq("id", CLOUD_ROW_ID)
          .limit(1);

      if (test.error) {
        throw test.error;
      }

      showCloudStatus(
        "متصل بالسحابة ✓",
        true
      );

      return true;
    } catch (error) {
      console.error(
        "Supabase connection error:",
        error
      );

      supabaseClient = null;

      showCloudStatus(
        "السحابة غير متاحة — الحفظ المحلي يعمل",
        false
      );

      return false;
    }
  }

  async function pushToCloud() {
    if (isPushing) return;
    if (!supabaseClient) return;

    if (!navigator.onLine) {
      showCloudStatus(
        "لا يوجد إنترنت — تم الحفظ محلياً",
        false
      );
      return;
    }

    isPushing = true;

    try {
      const localData = readLocalDatabase();
      const timestamp = new Date().toISOString();

      const payload = {
        id: CLOUD_ROW_ID,
        data: localData,
        updated_at: timestamp,
        device_id: deviceId
      };

      const result =
        await supabaseClient
          .from(TABLE_NAME)
          .upsert(payload, {
            onConflict: "id"
          });

      if (result.error) {
        throw result.error;
      }

      lastCloudTimestamp = timestamp;

      showCloudStatus(
        "تم حفظ البيانات سحابياً ✓",
        true
      );
    } catch (error) {
      console.error(
        "Cloud push error:",
        error
      );

      showCloudStatus(
        "تم الحفظ محلياً — تعذر الرفع للسحابة",
        false
      );
    } finally {
      isPushing = false;
    }
  }

  async function pullFromCloud() {
    if (isPulling) return;
    if (!supabaseClient) return;
    if (!navigator.onLine) return;

    isPulling = true;

    try {
      const result =
        await supabaseClient
          .from(TABLE_NAME)
          .select(
            "id,data,updated_at,device_id"
          )
          .eq("id", CLOUD_ROW_ID)
          .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      const remote = result.data;

      if (!remote) {
        await pushToCloud();
        return;
      }

      if (!remote.data) return;

      if (
        remote.updated_at &&
        remote.updated_at === lastCloudTimestamp
      ) {
        return;
      }

      if (
        remote.device_id &&
        remote.device_id === deviceId &&
        remote.updated_at
      ) {
        lastCloudTimestamp =
          remote.updated_at;
        return;
      }

      const cloudData = {
        dresses:
          Array.isArray(remote.data.dresses)
            ? remote.data.dresses
            : [],
        orders:
          Array.isArray(remote.data.orders)
            ? remote.data.orders
            : [],
        customers:
          Array.isArray(remote.data.customers)
            ? remote.data.customers
            : [],
        expenses:
          Array.isArray(remote.data.expenses)
            ? remote.data.expenses
            : []
      };

      const written =
        writeLocalDatabase(cloudData);

      if (!written) {
        throw new Error(
          "Could not write cloud data to local database."
        );
      }

      lastCloudTimestamp =
        remote.updated_at || "";

      showCloudStatus(
        "تم تحديث البيانات من السحابة ✓",
        true
      );

      setTimeout(function () {
        window.location.reload();
      }, 350);
    } catch (error) {
      console.error(
        "Cloud pull error:",
        error
      );

      showCloudStatus(
        "الحفظ المحلي يعمل — تعذر جلب السحابة",
        false
      );
    } finally {
      isPulling = false;
    }
  }

  function safeSaveDB() {
    const saved =
      performOriginalLocalSave();

    if (!saved) return;

    findDatabaseStorageKey();

    clearTimeout(cloudTimer);

    cloudTimer = setTimeout(
      function () {
        if (supabaseClient) {
          pushToCloud();
        }
      },
      500
    );
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function openCloudSettings() {
    const config =
      getConfig() || {
        url: "",
        key: ""
      };

    const html = `
      <div class="field">
        <label>رابط مشروع Supabase</label>
        <input
          id="alkazrajiSupabaseUrl"
          value="${escapeHtml(config.url || "")}"
          placeholder="https://xxxxxxxx.supabase.co"
        >
      </div>

      <div class="field">
        <label>Publishable Key</label>
        <textarea
          id="alkazrajiSupabaseKey"
          placeholder="sb_publishable_..."
          style="direction:ltr;text-align:left;min-height:120px"
        >${escapeHtml(config.key || "")}</textarea>
      </div>

      <div style="
        background:#f8fafc;
        border-radius:12px;
        padding:12px;
        margin-bottom:14px;
        color:#475569;
        font-size:13px;
        line-height:1.7;
      ">
        استخدم Publishable Key فقط.
        <br>
        لا تضع Secret Key أو service_role هنا.
      </div>

      <button
        class="primary"
        style="width:100%"
        onclick="window.alkazrajiSaveSupabaseSettings()"
      >
        حفظ واختبار الاتصال
      </button>

      <button
        class="secondary"
        style="width:100%;margin-top:10px"
        onclick="window.alkazrajiCloudSyncNow()"
      >
        ☁️ مزامنة البيانات الآن
      </button>
    `;

    if (
      typeof window.openModal === "function"
    ) {
      window.openModal(
        "إعداد المزامنة السحابية",
        html
      );
    } else {
      alert(
        "واجهة الإعداد غير متاحة حالياً."
      );
    }
  }

  window.alkazrajiSaveSupabaseSettings =
    async function () {
      const url =
        (
          document.getElementById(
            "alkazrajiSupabaseUrl"
          )?.value || ""
        )
          .trim()
          .replace(/\/$/, "");

      const key =
        (
          document.getElementById(
            "alkazrajiSupabaseKey"
          )?.value || ""
        ).trim();

      if (!url || !key) {
        alert(
          "أدخل رابط Supabase والمفتاح."
        );
        return;
      }

      saveConfig({
        url: url,
        key: key
      });

      const connected =
        await connectSupabase();

      if (!connected) {
        alert(
          "تعذر الاتصال بقاعدة البيانات.\n\n" +
          "تأكد من الرابط والمفتاح ومن إعدادات Supabase."
        );
        return;
      }

      if (
        typeof window.closeModal ===
        "function"
      ) {
        window.closeModal();
      }

      await pushToCloud();
    };

  window.alkazrajiCloudSyncNow =
    async function () {
      if (!supabaseClient) {
        const connected =
          await connectSupabase();

        if (!connected) {
          openCloudSettings();
          return;
        }
      }

      if (originalSaveDB) {
        try {
          originalSaveDB();
        } catch (error) {
          console.error(
            "Original save before sync failed:",
            error
          );
        }
      }

      findDatabaseStorageKey();

      await pushToCloud();
      await pullFromCloud();
    };

  window.alkazrajiOpenCloudSettings =
    openCloudSettings;

  function addCloudMenuButton() {
    const panel =
      document.getElementById(
        "menuPanel"
      );

    if (!panel) return;

    if (
      document.getElementById(
        "alkazrajiCloudSettingsButton"
      )
    ) {
      return;
    }

    const button =
      document.createElement("button");

    button.id =
      "alkazrajiCloudSettingsButton";

    button.className =
      "menu-item";

    button.innerHTML =
      "☁️ إعداد المزامنة السحابية";

    button.onclick =
      function () {
        if (
          typeof window.closeMenu ===
          "function"
        ) {
          window.closeMenu();
        }

        openCloudSettings();
      };

    panel.appendChild(button);
  }

  async function boot() {
    findDatabaseStorageKey();

    /*
      لا نستبدل saveDB إلا بعد الاحتفاظ بالنسخة الأصلية.
      النظام المحلي يبقى مسؤولاً عن حفظ البيانات.
    */
    window.saveDB = safeSaveDB;

    addCloudMenuButton();

    if (!window.supabase) {
      showCloudStatus(
        "النظام يعمل محلياً ✓",
        true
      );
      return;
    }

    const config = getConfig();

    if (!isValidConfig(config)) {
      showCloudStatus(
        "الحفظ المحلي يعمل ✓",
        true
      );
      return;
    }

    const connected =
      await connectSupabase();

    if (connected) {
      await pullFromCloud();
    }
  }

  window.addEventListener(
    "online",
    async function () {
      showCloudStatus(
        "عاد الإنترنت — جاري المزامنة...",
        true
      );

      if (!supabaseClient) {
        const connected =
          await connectSupabase();

        if (!connected) return;
      }

      await pushToCloud();
      await pullFromCloud();
    }
  );

  window.addEventListener(
    "offline",
    function () {
      showCloudStatus(
        "لا يوجد إنترنت — الحفظ المحلي يعمل ✓",
        true
      );
    }
  );

  setInterval(
    async function () {
      if (!navigator.onLine) return;
      if (!supabaseClient) return;

      await pullFromCloud();
    },
    15000
  );

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot
    );
  } else {
    boot();
  }

})();
