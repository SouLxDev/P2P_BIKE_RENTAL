const getAdminEmails = () => (
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const isAdminEmail = (email) => {
  if (!email) return false;
  return getAdminEmails().includes(String(email).trim().toLowerCase());
};

module.exports = {
  getAdminEmails,
  isAdminEmail,
};
