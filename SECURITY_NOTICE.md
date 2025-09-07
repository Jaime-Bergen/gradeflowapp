# 🔒 Security Notice

## ⚠️ IMPORTANT: Environment Files

**NEVER commit actual `.env` files to version control!**

### What we provide:
- ✅ `.env.example` - Template with placeholder values
- ✅ `.gitignore` - Excludes actual `.env` files

### What you must do:
1. Copy `.env.example` to `.env`
2. Replace ALL placeholder values with your actual credentials
3. Keep your `.env` file LOCAL ONLY

### Sensitive information to protect:
- Database credentials
- JWT secrets
- Email passwords
- API keys
- Production URLs

### If you accidentally committed sensitive data:
1. **Change all passwords/secrets immediately**
2. **Rotate JWT secrets**
3. **Update database credentials**
4. Consider the exposed data compromised

### Best practices:
- Use environment variables in production
- Different secrets for dev/staging/production
- Regular credential rotation
- Use secret management services for production

---
*This notice was added after accidentally including real credentials in version control.*
