{{- define "chista.name" -}}
{{- default "chista" .Chart.Name -}}
{{- end -}}

{{- define "chista.labels" -}}
app.kubernetes.io/part-of: chista
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "chista.image" -}}
{{- printf "%s/%s:%s" .registry .name .tag -}}
{{- end -}}
