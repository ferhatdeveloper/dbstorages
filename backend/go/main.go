package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
)

var (
	db       *sql.DB
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

func main() {
	port := os.Getenv("GO_PORT")
	if port == "" {
		port = "8080"
	}

	dsn := os.Getenv("TENANT_DATABASE_URL")
	if dsn == "" {
		dsn = "postgresql://graphcore:graphcore@localhost:5432/graphcore_demo?sslmode=disable"
	}

	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Printf("postgres open error: %v (API will return 503)", err)
	} else if err = db.Ping(); err != nil {
		log.Printf("postgres ping error: %v (API will return 503)", err)
		db = nil
	} else {
		log.Println("Go data-plane connected to tenant Postgres")
	}

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Authorization", "X-Project-Id"},
	}))

	api := r.Group("/api/v1")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"ok": true, "db": db != nil})
		})
		api.GET("/tables", getTables)
		api.GET("/tables/:table", getTableData)
		api.POST("/tables/:table", createTableRow)
		api.PUT("/tables/:table/:id", updateTableRow)
		api.DELETE("/tables/:table/:id", deleteTableRow)
		api.POST("/sql/execute", executeSQL)

		api.GET("/files", getFiles)
		api.POST("/files/upload", notImplemented)
		api.GET("/files/:id", notImplemented)
		api.DELETE("/files/:id", notImplemented)

		api.GET("/migrations", getMigrations)
		api.POST("/migrations", notImplemented)
		api.POST("/migrations/:id/apply", notImplemented)
		api.POST("/migrations/:id/rollback", notImplemented)

		api.GET("/realtime", handleWebSocket)
	}

	log.Printf("Go data-plane on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func requireDB(c *gin.Context) bool {
	if db == nil {
		c.JSON(503, gin.H{
			"success": false,
			"error":   "Tenant Postgres unavailable. Start docker compose postgres.",
		})
		return false
	}
	return true
}

func quoteIdent(name string) (string, error) {
	if name == "" {
		return "", fmt.Errorf("empty identifier")
	}
	for _, r := range name {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_') {
			return "", fmt.Errorf("invalid identifier")
		}
	}
	return `"` + name + `"`, nil
}

func getTables(c *gin.Context) {
	if !requireDB(c) {
		return
	}
	rows, err := db.Query(`
		SELECT table_name FROM information_schema.tables
		WHERE table_schema='public' AND table_type='BASE TABLE'
		ORDER BY table_name`)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer rows.Close()

	tables := []gin.H{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		var count int
		q, _ := quoteIdent(name)
		_ = db.QueryRow(`SELECT COUNT(*) FROM ` + q).Scan(&count)
		colRows, err := db.Query(`
			SELECT column_name, data_type, is_nullable
			FROM information_schema.columns
			WHERE table_schema='public' AND table_name=$1
			ORDER BY ordinal_position`, name)
		cols := []gin.H{}
		if err == nil {
			for colRows.Next() {
				var cn, dt, nullable string
				_ = colRows.Scan(&cn, &dt, &nullable)
				cols = append(cols, gin.H{
					"name": cn, "type": dt, "nullable": nullable == "YES",
					"is_primary": false, "is_foreign_key": false,
				})
			}
			colRows.Close()
		}
		tables = append(tables, gin.H{
			"name": name, "columns": cols, "rowCount": count,
			"locked": false, "created_at": "", "updated_at": "",
		})
	}
	c.JSON(200, gin.H{"success": true, "data": tables, "tables": tables})
}

func getTableData(c *gin.Context) {
	if !requireDB(c) {
		return
	}
	table := c.Param("table")
	q, err := quoteIdent(table)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	colRows, err := db.Query(`
		SELECT column_name, data_type, is_nullable
		FROM information_schema.columns
		WHERE table_schema='public' AND table_name=$1
		ORDER BY ordinal_position`, table)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "error": err.Error()})
		return
	}
	columns := []gin.H{}
	for colRows.Next() {
		var cn, dt, nullable string
		_ = colRows.Scan(&cn, &dt, &nullable)
		columns = append(columns, gin.H{
			"name": cn, "type": dt, "nullable": nullable == "YES",
			"is_primary": false, "is_foreign_key": false,
		})
	}
	colRows.Close()

	var total int
	_ = db.QueryRow(`SELECT COUNT(*) FROM ` + q).Scan(&total)

	rows, err := db.Query(fmt.Sprintf(`SELECT * FROM %s LIMIT $1 OFFSET $2`, q), pageSize, offset)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer rows.Close()
	data, err := scanRows(rows)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"data": gin.H{
			"columns": columns, "rows": data, "total": total, "page": page, "pageSize": pageSize,
		},
		"table": table,
	})
}

func scanRows(rows *sql.Rows) ([]map[string]any, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := map[string]any{}
		for i, c := range cols {
			v := vals[i]
			if b, ok := v.([]byte); ok {
				m[c] = string(b)
			} else {
				m[c] = v
			}
		}
		out = append(out, m)
	}
	return out, nil
}

func createTableRow(c *gin.Context) {
	if !requireDB(c) {
		return
	}
	table := c.Param("table")
	q, err := quoteIdent(table)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}
	var body map[string]any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}
	data, _ := body["data"].(map[string]any)
	if data == nil {
		data = body
	}
	cols := []string{}
	placeholders := []string{}
	vals := []any{}
	i := 1
	for k, v := range data {
		if k == "id" {
			continue
		}
		qi, err := quoteIdent(k)
		if err != nil {
			continue
		}
		cols = append(cols, qi)
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		vals = append(vals, v)
		i++
	}
	if len(cols) == 0 {
		c.JSON(400, gin.H{"success": false, "error": "no columns"})
		return
	}
	sqlStr := fmt.Sprintf(`INSERT INTO %s (%s) VALUES (%s) RETURNING *`,
		q, strings.Join(cols, ","), strings.Join(placeholders, ","))
	rows, err := db.Query(sqlStr, vals...)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer rows.Close()
	out, _ := scanRows(rows)
	c.JSON(201, gin.H{"success": true, "data": firstOrNil(out)})
}

func updateTableRow(c *gin.Context) {
	if !requireDB(c) {
		return
	}
	table := c.Param("table")
	id := c.Param("id")
	q, err := quoteIdent(table)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}
	var body map[string]any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}
	data, _ := body["data"].(map[string]any)
	if data == nil {
		data = body
	}
	sets := []string{}
	vals := []any{}
	i := 1
	for k, v := range data {
		if k == "id" {
			continue
		}
		qi, err := quoteIdent(k)
		if err != nil {
			continue
		}
		sets = append(sets, fmt.Sprintf("%s=$%d", qi, i))
		vals = append(vals, v)
		i++
	}
	vals = append(vals, id)
	sqlStr := fmt.Sprintf(`UPDATE %s SET %s WHERE id=$%d RETURNING *`, q, strings.Join(sets, ","), i)
	rows, err := db.Query(sqlStr, vals...)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer rows.Close()
	out, _ := scanRows(rows)
	c.JSON(200, gin.H{"success": true, "data": firstOrNil(out)})
}

func deleteTableRow(c *gin.Context) {
	if !requireDB(c) {
		return
	}
	table := c.Param("table")
	id := c.Param("id")
	q, err := quoteIdent(table)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}
	res, err := db.Exec(fmt.Sprintf(`DELETE FROM %s WHERE id=$1`, q), id)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	c.JSON(200, gin.H{"success": true, "data": gin.H{"deleted": n > 0}})
}

func executeSQL(c *gin.Context) {
	if !requireDB(c) {
		return
	}
	var body struct {
		Query string `json:"query"`
		SQL   string `json:"sql"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}
	q := strings.TrimSpace(body.Query)
	if q == "" {
		q = strings.TrimSpace(body.SQL)
	}
	if q == "" {
		c.JSON(400, gin.H{"success": false, "error": "query required"})
		return
	}
	rows, err := db.Query(q)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer rows.Close()
	data, err := scanRows(rows)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "error": err.Error()})
		return
	}
	cols := []string{}
	if len(data) > 0 {
		for k := range data[0] {
			cols = append(cols, k)
		}
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"rows": data, "columns": cols, "rowCount": len(data)}})
}

func firstOrNil(rows []map[string]any) any {
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}

func getFiles(c *gin.Context) {
	c.JSON(200, gin.H{"success": true, "files": []any{}, "message": "Storage not wired"})
}

func getMigrations(c *gin.Context) {
	c.JSON(200, gin.H{"success": true, "migrations": []any{}, "message": "Migrations not wired"})
}

func notImplemented(c *gin.Context) {
	c.JSON(501, gin.H{"success": false, "error": "not implemented"})
}

func handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	for {
		mt, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if err := conn.WriteMessage(mt, msg); err != nil {
			break
		}
	}
}
