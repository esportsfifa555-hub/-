(function () {
  const supabase = window.schoolSupabase;
  let selectedRole = "student";
  let activeAccount = null;
  let onLoginCallback = null;
  let onLogoutCallback = null;

  function showNotice(message, isError) {
    const notice = document.getElementById("auth-notice");
    notice.textContent = message;
    notice.classList.toggle("error", Boolean(isError));
  }

  function showAccountNotice(message, isError) {
    const notice = document.getElementById("account-notice");
    notice.textContent = message;
    notice.classList.toggle("error", Boolean(isError));
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function updateAuthView() {
    const signupForm = document.getElementById("signup-form");
    const isSigningUp = signupForm.dataset.open === "true";
    document.querySelectorAll(".auth-tab").forEach(tab => {
      const active = tab.dataset.role === selectedRole;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.getElementById("login-form").hidden = isSigningUp;
    signupForm.hidden = !isSigningUp;
    document.getElementById("show-login").hidden = !isSigningUp;
    document.getElementById("show-signup").hidden =
      selectedRole !== "student" || isSigningUp;
    document.getElementById("teacher-config-help").hidden = selectedRole !== "teacher";
  }

  function switchAppView(view) {
    const showAccounts = view === "accounts";
    const showStudentProfile = view === "student-profile";
    document.getElementById("dashboard-view").hidden = showAccounts || showStudentProfile;
    document.getElementById("account-view").hidden = !showAccounts;
    document.getElementById("student-profile-view").hidden = !showStudentProfile;
    document.querySelectorAll(".nav-link").forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function returnToLogin(message) {
    if (onLogoutCallback) onLogoutCallback();
    activeAccount = null;
    document.getElementById("app-content").hidden = true;
    document.getElementById("app-nav").hidden = true;
    switchAppView("dashboard");
    document.getElementById("login-screen").hidden = false;
    document.getElementById("logout-button").hidden = true;
    document.getElementById("session-label").textContent = "🏫 สำหรับนักเรียนและคุณครู";
    showNotice(message || "", false);
  }

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, classroom, student_number, photo_path, line_user_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("ไม่พบโปรไฟล์บัญชี กรุณาตรวจสอบการตั้งค่า profiles ใน Supabase");
    return data;
  }

  async function enterApp(profile) {
    if (!profile.is_active) {
      await supabase.auth.signOut();
      returnToLogin("บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อคุณครู");
      return;
    }

    activeAccount = {
      id: profile.id,
      email: profile.email,
      name: profile.full_name,
      classroom: profile.classroom,
      studentNumber: profile.student_number,
      photoPath: profile.photo_path,
      lineUserId: profile.line_user_id,
      role: profile.role
    };
    document.getElementById("login-screen").hidden = true;
    document.getElementById("app-content").hidden = false;
    document.getElementById("app-nav").hidden = false;
    document.querySelectorAll(".nav-link[data-role-only]").forEach(button => {
      button.hidden = button.dataset.roleOnly !== activeAccount.role;
    });
    document.getElementById("logout-button").hidden = false;
    document.getElementById("session-label").textContent =
      `${activeAccount.role === "teacher" ? "👩‍🏫 คุณครู" : "🎒 นักเรียน"}: ${activeAccount.name}`;
    switchAppView(activeAccount.role === "student" ? "student-profile" : "dashboard");
    await onLoginCallback(activeAccount);
    if (activeAccount.role === "teacher") {
      document.getElementById("line-user-id").value = activeAccount.lineUserId || "";
      await renderAccounts();
    }
  }

  async function enterSession(user, expectedRole) {
    try {
      const profile = await fetchProfile(user.id);
      if (expectedRole && profile.role !== expectedRole) {
        await supabase.auth.signOut();
        showNotice("บัญชีนี้ไม่มีสิทธิ์เข้าสู่ระบบประเภทที่เลือก", true);
        return;
      }
      await enterApp(profile);
    } catch (error) {
      console.error("โหลดข้อมูลบัญชีจาก Supabase ไม่สำเร็จ", error);
      await supabase.auth.signOut();
      showNotice(error.message || "โหลดข้อมูลบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง", true);
    }
  }

  async function invokeAccountAdmin(payload) {
    const { data, error } = await supabase.functions.invoke("account-admin", { body: payload });
    if (error) {
      let message = error.message;
      if (error.context && typeof error.context.json === "function") {
        try {
          const response = await error.context.json();
          if (response && response.error) message = response.error;
        } catch (parseError) {
          console.error("อ่านรายละเอียดข้อผิดพลาดจาก account-admin ไม่สำเร็จ", parseError);
        }
      }
      throw new Error(message || "คำขอจัดการบัญชีไม่สำเร็จ");
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  async function renderAccounts() {
    const accountList = document.getElementById("account-list");
    accountList.innerHTML = '<div class="empty">กำลังโหลดบัญชี...</div>';
    const { data: accounts, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, classroom, role, is_active")
      .order("full_name");
    if (error) {
      console.error("โหลดรายชื่อบัญชีไม่สำเร็จ", error);
      accountList.innerHTML = '<div class="empty">โหลดรายชื่อบัญชีไม่สำเร็จ</div>';
      showAccountNotice(error.message || "โหลดรายชื่อบัญชีไม่สำเร็จ", true);
      return;
    }

    document.getElementById("account-total").textContent = accounts.length;
    document.getElementById("teacher-total").textContent =
      accounts.filter(account => account.role === "teacher" && account.is_active).length;
    document.getElementById("student-total").textContent =
      accounts.filter(account => account.role === "student" && account.is_active).length;
    accountList.innerHTML = accounts.map(account => {
      const role = account.role === "teacher" ? "teacher" : "student";
      const roleLabel = role === "teacher" ? "คุณครู" : "นักเรียน";
      const classroom = account.classroom
        ? `<br>ชั้น / ห้อง: ${escapeHTML(account.classroom)}`
        : "";
      const status = account.is_active ? "" : '<span class="availability out">ปิดใช้งาน</span>';
      const roleControls = account.is_active
        ? `
          <label class="sr-only" for="role-${escapeHTML(account.id)}">บทบาทของ ${escapeHTML(account.email)}</label>
          <select id="role-${escapeHTML(account.id)}" data-role-select>
            <option value="student" ${role === "student" ? "selected" : ""}>นักเรียน</option>
            <option value="teacher" ${role === "teacher" ? "selected" : ""}>คุณครู</option>
          </select>
          <button class="return-button" type="button" data-save-role>บันทึกบทบาท</button>
          ${role === "student"
            ? '<button class="delete-account-button" type="button" data-delete-account>ลบบัญชี</button>'
            : ""}`
        : status;
      const passwordReset = account.is_active
        ? `
          <form class="account-reset-form" data-reset-password data-account-id="${escapeHTML(account.id)}">
            <label class="sr-only" for="password-${escapeHTML(account.id)}">ตั้งรหัสผ่านใหม่ให้ ${escapeHTML(account.email)}</label>
            <input id="password-${escapeHTML(account.id)}" name="password" type="password" minlength="8" maxlength="100" autocomplete="new-password" placeholder="ตั้งรหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" required>
            <button class="return-button" type="submit">ตั้งรหัสใหม่</button>
          </form>`
        : "";
      return `
        <article class="account-item ${account.is_active ? "" : "central-account"}" data-account-id="${escapeHTML(account.id)}">
          <div class="account-heading">
            <div>
              <div class="account-name">${escapeHTML(account.full_name || account.email)}</div>
              <div class="account-detail">${escapeHTML(account.email)} · ${roleLabel}${classroom}</div>
            </div>
            <div class="account-role-edit">${roleControls}</div>
          </div>
          ${passwordReset}
        </article>`;
    }).join("") || '<div class="empty">ยังไม่มีบัญชี</div>';
  }

  async function restoreSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("ตรวจสอบสถานะล็อกอินไม่สำเร็จ", error);
      showNotice("ตรวจสอบสถานะล็อกอินไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่", true);
      return;
    }
    if (data.session) await enterSession(data.session.user);
  }

  window.initializeAuth = async function (onLogin, onLogout) {
    onLoginCallback = onLogin;
    onLogoutCallback = onLogout;
    if (!supabase) {
      showNotice("ยังไม่ได้เชื่อม Supabase กรุณาตั้งค่า Project URL และ anon key ใน supabase-config.js", true);
      document.querySelectorAll(".auth-tab, #login-form button, #signup-form button, #show-signup, #show-login").forEach(button => {
        button.disabled = true;
      });
      document.getElementById("show-signup").hidden = true;
      return;
    }

    document.querySelectorAll(".auth-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        selectedRole = tab.dataset.role;
        document.getElementById("signup-form").dataset.open = "false";
        showNotice("", false);
        updateAuthView();
      });
    });

    document.querySelectorAll(".nav-link").forEach(button => {
      button.addEventListener("click", () => {
        if (!activeAccount || button.dataset.roleOnly !== activeAccount.role) return;
        switchAppView(button.dataset.view);
      });
    });

    document.getElementById("show-signup").addEventListener("click", () => {
      document.getElementById("signup-form").dataset.open = "true";
      updateAuthView();
      showNotice("", false);
    });

    document.getElementById("show-login").addEventListener("click", () => {
      document.getElementById("signup-form").dataset.open = "false";
      updateAuthView();
      showNotice("", false);
    });

    document.getElementById("signup-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (selectedRole !== "student") {
        showNotice("สมัครได้เฉพาะบัญชีนักเรียน บัญชีครูให้สร้างใน Supabase Authentication", true);
        return;
      }
      const formData = new FormData(form);
      const email = String(formData.get("email")).trim();
      const password = String(formData.get("password"));
      const fullName = String(formData.get("name")).trim();
      const classroom = String(formData.get("classroom")).trim();
      const studentNumber = String(formData.get("studentNumber")).trim();
      if (!email || !fullName || !classroom || !studentNumber || password.length < 8) {
        showNotice("กรุณากรอกชื่อ ชั้น/ห้อง เลขประจำตัว อีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษร", true);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, classroom, student_number: studentNumber } }
      });
      if (error) {
        console.error("สมัครบัญชีนักเรียนไม่สำเร็จ", error);
        showNotice(error.message || "สมัครบัญชีไม่สำเร็จ", true);
        return;
      }
      form.reset();
      document.getElementById("signup-form").dataset.open = "false";
      updateAuthView();
      if (data.session && data.user) {
        await enterSession(data.user);
      } else {
        showNotice("สมัครแล้ว กรุณาตรวจอีเมลเพื่อยืนยันบัญชี ก่อนเข้าสู่ระบบ", false);
      }
    });

    document.getElementById("login-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      const email = String(formData.get("email")).trim();
      const password = String(formData.get("password"));
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("เข้าสู่ระบบไม่สำเร็จ", error);
        showNotice(error.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง", true);
        return;
      }
      if (!data.user) {
        showNotice("เข้าสู่ระบบแล้วแต่ไม่พบข้อมูลบัญชี", true);
        return;
      }
      form.reset();
      showNotice("", false);
      await enterSession(data.user, selectedRole);
    });

    document.getElementById("account-list").addEventListener("click", async event => {
      const deleteButton = event.target.closest("[data-delete-account]");
      if (deleteButton) {
        const row = deleteButton.closest("[data-account-id]");
        const accountId = row.dataset.accountId;
        const accountName = row.querySelector(".account-name").textContent;
        if (!window.confirm(`ยืนยันลบบัญชีนักเรียน ${accountName}? ประวัติการยืมเดิมจะยังอยู่`)) return;
        try {
          await invokeAccountAdmin({ action: "delete-student", userId: accountId });
          await renderAccounts();
          showAccountNotice(`ลบบัญชี ${accountName} แล้ว ประวัติการยืมเดิมยังเก็บไว้`, false);
        } catch (error) {
          console.error("ลบบัญชีนักเรียนไม่สำเร็จ", error);
          showAccountNotice(error.message || "ลบบัญชีนักเรียนไม่สำเร็จ", true);
        }
        return;
      }

      const button = event.target.closest("[data-save-role]");
      if (!button) return;
      const row = button.closest("[data-account-id]");
      const role = row.querySelector("[data-role-select]").value;
      if (role !== "student" && role !== "teacher") return;
      try {
        await invokeAccountAdmin({
          action: "set-role",
          userId: row.dataset.accountId,
          role
        });
        if (row.dataset.accountId === activeAccount.id && role !== "teacher") {
          const { error: signOutError } = await supabase.auth.signOut();
          returnToLogin("เปลี่ยนบทบาทแล้ว กรุณาเข้าสู่ระบบใหม่");
          if (signOutError) {
            console.error("ออกจากระบบหลังเปลี่ยนบทบาทไม่สำเร็จ", signOutError);
            showNotice("เปลี่ยนบทบาทแล้ว กรุณาปิดหน้านี้และเข้าสู่ระบบใหม่", true);
          }
          return;
        }
        await renderAccounts();
        showAccountNotice("เปลี่ยนบทบาทเรียบร้อยแล้ว", false);
      } catch (error) {
        console.error("เปลี่ยนบทบาทไม่สำเร็จ", error);
        showAccountNotice(error.message || "เปลี่ยนบทบาทไม่สำเร็จ", true);
      }
    });

    document.getElementById("account-list").addEventListener("submit", async event => {
      const form = event.target.closest("[data-reset-password]");
      if (!form) return;
      event.preventDefault();
      const password = String(new FormData(form).get("password"));
      if (password.length < 8) {
        showAccountNotice("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร", true);
        return;
      }
      try {
        await invokeAccountAdmin({
          action: "reset-password",
          userId: form.dataset.accountId,
          password
        });
        form.reset();
        showAccountNotice("ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว", false);
      } catch (error) {
        console.error("ตั้งรหัสผ่านใหม่ไม่สำเร็จ", error);
        showAccountNotice(error.message || "ตั้งรหัสผ่านใหม่ไม่สำเร็จ", true);
      }
    });

    document.getElementById("line-id-form").addEventListener("submit", async event => {
      event.preventDefault();
      const lineUserId = String(new FormData(event.currentTarget).get("lineUserId") || "").trim();
      if (lineUserId && !/^U[0-9a-f]{32}$/i.test(lineUserId)) {
        showAccountNotice("LINE User ID ไม่ถูกต้อง ต้องเป็น U ตามด้วย 32 ตัวอักษร/ตัวเลข", true);
        return;
      }
      try {
        await invokeAccountAdmin({ action: "set-line-user-id", lineUserId });
        activeAccount.lineUserId = lineUserId;
        showAccountNotice(
          lineUserId ? "บันทึก LINE ID แล้ว ครูบัญชีนี้จะได้รับการแจ้งเตือน" : "ลบ LINE ID แล้ว",
          false
        );
      } catch (error) {
        console.error("บันทึก LINE User ID ไม่สำเร็จ", error);
        showAccountNotice(error.message || "บันทึก LINE ID ไม่สำเร็จ", true);
      }
    });

    document.getElementById("logout-button").addEventListener("click", async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("ออกจากระบบไม่สำเร็จ", error);
        showNotice(error.message || "ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง", true);
        return;
      }
      returnToLogin("");
    });

    updateAuthView();
    await restoreSession();
  };
})();
