{{- define "asha.name" -}}
{{- default "asha" .Chart.Name -}}
{{- end -}}

{{- define "asha.labels" -}}
app.kubernetes.io/part-of: asha
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "asha.image" -}}
{{- printf "%s/%s:%s" .registry .name .tag -}}
{{- end -}}
