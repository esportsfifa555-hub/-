(function () {
let equipment = [];
let loans = [];
let currentUser = null;

const supabase = window.schoolSupabase;
const grid = document.getElementById("equipment-grid");
const select = document.getElementById("equipment-select");
const loanList = document.getElementById("loan-list");
const notice = document.getElementById("form-notice");
const dashboardNotice = document.getElementById("dashboard-notice");

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function activeLoansFor(itemId) {
  return loans.filter(loan => loan.equipmentId === itemId).length;
}

function availableFor(item) {
  return Math.max(0, item.total - item.activeCount);
}

function showNotice(message, isError) {
  const target = currentUser && currentUser.role === "teacher" ? dashboardNotice : notice;
  target.textContent = message;
  target.classList.toggle("error", Boolean(isError));
}

function renderEquipment() {
  const query = document.getElementById("search").value.trim().toLocaleLowerCase("th");
  const filtered = equipment.filter(item =>
    `${item.name} ${item.category}`.toLocaleLowerCase("th").includes(query)
  );

  grid.innerHTML = filtered.map(item => {
    const available = availableFor(item);
    return `
      <article class="equipment-card">
        <div class="equipment-top">
          <div class="equipment-icon" aria-hidden="true">${escapeHTML(item.icon)}</div>
          <span class="availability ${available === 0 ? "out" : ""}">
            ${available === 0 ? "หมดชั่วคราว" : "● ว่าง " + available + " ชิ้น"}
          </span>
        </div>
        <h3>${escapeHTML(item.name)}</h3>
        <p class="equipment-meta">${escapeHTML(item.category)}</p>
        <div class="card-bottom">
          <span class="stock">ทั้งหมด ${item.total} ชิ้น</span>
          ${currentUser && currentUser.role === "student"
            ? `<button class="borrow-button" type="button" data-select="${escapeHTML(item.id)}" ${available === 0 ? "disabled" : ""}>เลือกยืม</button>`
            : ""}
        </div>
      </article>`;
  }).join("") || '<div class="empty">ไม่พบอุปกรณ์ที่ค้นหา</div>';

  const currentSelection = select.value;
  select.innerHTML = '<option value="">เลือกอุปกรณ์กีฬา</option>' + equipment
    .filter(item => availableFor(item) > 0)
    .map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} (ว่าง ${availableFor(item)} ชิ้น)</option>`)
    .join("");
  if (equipment.some(item => item.id === currentSelection && availableFor(item) > 0)) {
    select.value = currentSelection;
  }
  document.getElementById("available-count").textContent =
    equipment.reduce((sum, item) => sum + availableFor(item), 0);
  document.getElementById("active-count").textContent =
    equipment.reduce((sum, item) => sum + item.activeCount, 0);
  document.getElementById("equipment-count").textContent = equipment.length;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "short", year: "numeric"
  }).format(date);
}

function renderLoans() {
  if (!loans.length) {
    loanList.innerHTML = currentUser && currentUser.role === "teacher"
      ? '<div class="empty">ยังไม่มีรายการที่กำลังยืม</div>'
      : '<div class="empty">ยังไม่มีรายการยืม<br>รายการใหม่จะแสดงที่นี่</div>';
    return;
  }
  loanList.innerHTML = loans.map(loan => {
    const item = equipment.find(entry => entry.id === loan.equipmentId);
    const itemName = item ? item.name : "อุปกรณ์ที่ไม่รู้จัก";
    const itemIcon = item ? item.icon : "📦";
    return `
      <div class="loan-row">
        <div>
          <div class="loan-name">${escapeHTML(itemIcon)} ${escapeHTML(itemName)}</div>
          <div class="loan-detail">
            ${escapeHTML(loan.borrower)} · ${escapeHTML(loan.classroom)}<br>
            ยืม ${formatDate(loan.borrowedAt)} · คืนภายใน ${formatDate(loan.dueDate)}
          </div>
        </div>
        ${currentUser.role === "teacher"
          ? `${loan.returnRequestedAt
            ? '<span class="availability">นักเรียนแจ้งขอคืน</span> '
            : ""}<button class="return-button" type="button" data-return="${escapeHTML(loan.id)}">ยืนยันรับคืน ✓</button>`
          : loan.returnRequestedAt
            ? '<span class="availability">ส่งคำขอคืนแล้ว • รอครูยืนยัน</span>'
            : `<button class="return-button" type="button" data-request-return="${escapeHTML(loan.id)}">แจ้งขอคืน</button>`}
      </div>`;
  }).join("");
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = new Date();
const dueDefault = new Date(today);
dueDefault.setDate(dueDefault.getDate() + 7);
document.getElementById("due-date").min = localDateString(today);
document.getElementById("due-date").value = localDateString(dueDefault);

async function loadDashboardData() {
  showNotice("กำลังโหลดข้อมูลจากฐานข้อมูล...", false);
  const [equipmentResult, loansResult] = await Promise.all([
    supabase.rpc("get_equipment_availability"),
    supabase
      .from("loans")
      .select("id, borrower_id, borrower_name, borrower_classroom, equipment_id, borrowed_at, due_date, return_requested_at")
      .is("returned_at", null)
      .order("created_at", { ascending: false })
  ]);
  if (equipmentResult.error || loansResult.error) {
    const error = equipmentResult.error || loansResult.error;
    console.error("โหลดข้อมูลอุปกรณ์หรือรายการยืมไม่สำเร็จ", error);
    showNotice(error.message || "โหลดข้อมูลจากฐานข้อมูลไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อและ schema", true);
    return false;
  }

  equipment = (equipmentResult.data || []).map(item => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    category: item.category,
    total: Number(item.total),
    activeCount: Number(item.active_count)
  }));
  loans = (loansResult.data || []).map(loan => ({
    id: loan.id,
    borrowerId: loan.borrower_id,
    borrower: loan.borrower_name,
    classroom: loan.borrower_classroom,
    equipmentId: loan.equipment_id,
    borrowedAt: loan.borrowed_at,
    dueDate: loan.due_date,
    returnRequestedAt: loan.return_requested_at
  }));
  renderEquipment();
  renderLoans();
  showNotice("", false);
  return true;
}

function showProfileNotice(message, isError) {
  const profileNotice = document.getElementById("profile-notice");
  profileNotice.textContent = message;
  profileNotice.classList.toggle("error", Boolean(isError));
}

async function renderStudentProfile() {
  if (!currentUser || currentUser.role !== "student") return;
  document.getElementById("student-profile-title").textContent = currentUser.name || "ข้อมูลนักเรียน";
  document.getElementById("student-profile-name").textContent = currentUser.name || "-";
  document.getElementById("student-profile-number").textContent = currentUser.studentNumber || "ยังไม่ได้ระบุ";
  document.getElementById("student-number-input").value = currentUser.studentNumber || "";
  document.getElementById("student-profile-classroom").textContent = currentUser.classroom || "-";
  document.getElementById("student-profile-email").textContent = currentUser.email || "-";
  const avatar = document.getElementById("student-avatar");
  avatar.replaceChildren(document.createTextNode("🎒"));
  if (currentUser.photoPath) {
    const { data, error } = await supabase.storage
      .from("student-avatars")
      .createSignedUrl(currentUser.photoPath, 3600);
    if (error) {
      console.error("โหลดรูปนักเรียนไม่สำเร็จ", error);
      showProfileNotice("โหลดรูปไม่สำเร็จ กรุณาอัปโหลดรูปใหม่", true);
      return;
    }
    const image = document.createElement("img");
    image.src = data.signedUrl;
    image.alt = `รูปของ ${currentUser.name || "นักเรียน"}`;
    avatar.replaceChildren(image);
  }
}

async function notifyTeachersOnLine(action, loanId) {
  const { error } = await supabase.functions.invoke("line-notify", {
    body: { action, loanId }
  });
  if (!error) return "";
  let message = error.message || "ส่ง LINE ไม่สำเร็จ";
  if (error.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.json();
      if (body && body.error) message = body.error;
    } catch (parseError) {
      console.error("อ่านรายละเอียดข้อผิดพลาด LINE ไม่สำเร็จ", parseError);
    }
  }
  console.error("แจ้งเตือน LINE ไม่สำเร็จ", error);
  return message;
}

function enterApp(account) {
  currentUser = account;
  document.getElementById("borrow-form").hidden = account.role !== "student";
  document.getElementById("teacher-note").hidden = account.role !== "teacher";
  document.getElementById("equipment-instruction").textContent = account.role === "student"
    ? "เลือกอุปกรณ์ที่ต้องการยืมจากรายการที่ยังว่าง"
    : "รายการอุปกรณ์ทั้งหมดในระบบ";
  if (account.role === "student") {
    document.getElementById("borrower").value = account.name;
    document.getElementById("borrower").readOnly = true;
    document.getElementById("classroom").value = account.classroom;
    document.getElementById("classroom").readOnly = true;
    renderStudentProfile();
  } else {
    document.getElementById("borrower").readOnly = false;
    document.getElementById("classroom").readOnly = false;
  }
  return loadDashboardData();
}

function leaveApp() {
  currentUser = null;
  equipment = [];
  loans = [];
  renderEquipment();
  renderLoans();
}

document.getElementById("search").addEventListener("input", renderEquipment);
grid.addEventListener("click", event => {
  const button = event.target.closest("[data-select]");
  if (!button) return;
  if (!currentUser || currentUser.role !== "student") {
    showNotice("กรุณาเข้าสู่ระบบด้วยบัญชีนักเรียนเพื่อยืมอุปกรณ์", true);
    return;
  }
  select.value = button.dataset.select;
  document.getElementById("borrower").focus();
  const item = equipment.find(entry => entry.id === button.dataset.select);
  if (item) showNotice(`เลือก${item.name}แล้ว กรอกข้อมูลให้ครบได้เลย`, false);
});

document.getElementById("borrow-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!currentUser || currentUser.role !== "student") {
    showNotice("การยืมอุปกรณ์ทำได้ด้วยบัญชีนักเรียนเท่านั้น", true);
    return;
  }
  const formData = new FormData(form);
  const equipmentId = String(formData.get("equipment") || "");
  const item = equipment.find(entry => entry.id === equipmentId);
  const dueDate = String(formData.get("dueDate") || "");
  if (!item || availableFor(item) < 1) {
    await loadDashboardData();
    showNotice("อุปกรณ์นี้ไม่มีให้ยืมแล้ว กรุณาเลือกอุปกรณ์อื่น", true);
    return;
  }
  if (!dueDate || dueDate < localDateString(new Date())) {
    showNotice("กรุณาเลือกกำหนดคืนเป็นวันนี้หรือวันหลังจากนี้", true);
    return;
  }

  const { data: loanId, error } = await supabase.rpc("borrow_equipment", {
    p_equipment_id: item.id,
    p_due_date: dueDate
  });
  if (error) {
    console.error("บันทึกการยืมไม่สำเร็จ", error);
    await loadDashboardData();
    showNotice(error.message || "บันทึกการยืมไม่สำเร็จ กรุณาลองอีกครั้ง", true);
    return;
  }

  form.reset();
  document.getElementById("borrower").value = currentUser.name;
  document.getElementById("classroom").value = currentUser.classroom;
  document.getElementById("due-date").value = localDateString(dueDefault);
  if (await loadDashboardData()) {
    const notificationError = await notifyTeachersOnLine("borrowed", loanId);
    showNotice(
      notificationError
        ? `บันทึกการยืม${item.name}แล้ว แต่แจ้ง LINE ไม่สำเร็จ: ${notificationError}`
        : `บันทึกการยืม${item.name}เรียบร้อยแล้ว และส่งแจ้ง LINE แล้ว`,
      Boolean(notificationError)
    );
  }
});

loanList.addEventListener("click", async event => {
  const requestButton = event.target.closest("[data-request-return]");
  if (requestButton) {
    if (!currentUser || currentUser.role !== "student") {
      showNotice("ส่งคำขอคืนได้เฉพาะบัญชีนักเรียน", true);
      return;
    }
    const { error } = await supabase.rpc("request_return", {
      p_loan_id: requestButton.dataset.requestReturn
    });
    if (error) {
      console.error("ส่งคำขอคืนไม่สำเร็จ", error);
      showNotice(error.message || "ส่งคำขอคืนไม่สำเร็จ กรุณาลองอีกครั้ง", true);
      return;
    }
    if (await loadDashboardData()) {
      const notificationError = await notifyTeachersOnLine("return-requested", requestButton.dataset.requestReturn);
      showNotice(
        notificationError
          ? `ส่งคำขอคืนแล้ว แต่แจ้ง LINE ไม่สำเร็จ: ${notificationError}`
          : "ส่งคำขอคืนแล้ว รอคุณครูตรวจรับและยืนยัน",
        Boolean(notificationError)
      );
    }
    return;
  }

  const button = event.target.closest("[data-return]");
  if (!button) return;
  if (!currentUser || currentUser.role !== "teacher") {
    showNotice("ยืนยันการคืนอุปกรณ์ได้เฉพาะบัญชีคุณครู", true);
    return;
  }
  const { error } = await supabase.rpc("return_equipment", {
    p_loan_id: button.dataset.return
  });
  if (error) {
    console.error("ยืนยันคืนอุปกรณ์ไม่สำเร็จ", error);
    showNotice(error.message || "ยืนยันคืนอุปกรณ์ไม่สำเร็จ กรุณาลองอีกครั้ง", true);
    return;
  }
  if (await loadDashboardData()) {
    const notificationError = await notifyTeachersOnLine("returned", button.dataset.return);
    showNotice(
      notificationError
        ? `บันทึกการคืนแล้ว แต่แจ้ง LINE ไม่สำเร็จ: ${notificationError}`
        : "บันทึกการคืนอุปกรณ์เรียบร้อยแล้ว และส่งแจ้ง LINE แล้ว",
      Boolean(notificationError)
    );
  }
});

document.getElementById("upload-student-photo").addEventListener("click", async () => {
  if (!currentUser || currentUser.role !== "student") return;
  const input = document.getElementById("student-photo-input");
  const file = input.files[0];
  if (!file) {
    showProfileNotice("กรุณาเลือกรูปก่อน", true);
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showProfileNotice("เลือกรูป JPG, PNG หรือ WebP ที่มีขนาดไม่เกิน 5 MB", true);
    return;
  }
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${currentUser.id}/avatar.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("student-avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    console.error("อัปโหลดรูปนักเรียนไม่สำเร็จ", uploadError);
    showProfileNotice(uploadError.message || "อัปโหลดรูปไม่สำเร็จ", true);
    return;
  }
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ photo_path: path })
    .eq("id", currentUser.id);
  if (updateError) {
    console.error("บันทึกตำแหน่งรูปในโปรไฟล์ไม่สำเร็จ", updateError);
    showProfileNotice("อัปโหลดรูปแล้ว แต่บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง", true);
    return;
  }
  currentUser.photoPath = path;
  await renderStudentProfile();
  showProfileNotice("บันทึกรูปนักเรียนแล้ว", false);
});

document.getElementById("student-number-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser || currentUser.role !== "student") return;
  const formData = new FormData(event.currentTarget);
  const studentNumber = String(formData.get("studentNumber") || "").trim();
  if (!studentNumber || studentNumber.length > 30) {
    showProfileNotice("กรุณากรอกเลขประจำตัวไม่เกิน 30 ตัวอักษร", true);
    return;
  }
  const { error } = await supabase
    .from("profiles")
    .update({ student_number: studentNumber })
    .eq("id", currentUser.id);
  if (error) {
    console.error("บันทึกเลขประจำตัวนักเรียนไม่สำเร็จ", error);
    showProfileNotice(error.message || "บันทึกเลขประจำตัวไม่สำเร็จ", true);
    return;
  }
  currentUser.studentNumber = studentNumber;
  document.getElementById("student-profile-number").textContent = studentNumber;
  showProfileNotice("บันทึกเลขประจำตัวแล้ว", false);
});

window.initializeAuth(enterApp, leaveApp);
})();
